import type { FastifyInstance } from "fastify";
import { prisma } from "../../../utils/db.js";
import { exigerUtilisateurActif } from "../../../utils/session.js";

type ParamsEchange = {
  id: string;
};

type CorpsEnvoi = {
  numeroSuivi?: unknown;
};

function erreurHttp(
  statusCode: number,
  message: string,
) {
  const erreur = new Error(message);

  Object.assign(erreur, {
    statusCode,
  });

  return erreur;
}

export async function routeDeclarerEnvoi(
  fastify: FastifyInstance,
) {
  fastify.put<{
    Params: ParamsEchange;
    Body: CorpsEnvoi;
  }>(
    "/api/echanges/:id/envoi",
    async (request, reply) => {
      const identif = request.params.id;

      if (!identif) {
        return reply.code(400).send({
          code: 400,
          message:
            "Identifiant de l'échange manquant.",
          details: null,
        });
      }

      const uuidValide =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          identif,
        );

      if (!uuidValide) {
        return reply.code(400).send({
          code: 400,
          message:
            "Identifiant de l'échange invalide.",
          details: null,
        });
      }

      const utilisateur =
        await exigerUtilisateurActif(
          request,
          reply,
        );

      const session = utilisateur.id;

      if (
        utilisateur.role !== "MEMBRE"
      ) {
        return reply.code(403).send({
          code: 403,
          message:
            "Action réservée aux membres.",
          details: null,
        });
      }

      const findEchange =
        await prisma.echange.findUnique({
          where: {
            id: identif,
          },
        });

      if (!findEchange) {
        return reply.code(404).send({
          code: 404,
          message:
            "Échange introuvable.",
          details: null,
        });
      }

      if (
        session !==
          findEchange.destinataireId &&
        session !==
          findEchange.proposantId
      ) {
        return reply.code(403).send({
          code: 403,
          message:
            "Vous n'êtes pas autorisé à déclarer un envoi pour cet échange.",
          details: null,
        });
      }

      if (
        findEchange.etape !== "ACCEPTE"
      ) {
        return reply.code(409).send({
          code: 409,
          message:
            "L'envoi ne peut être déclaré que pour un échange accepté.",
          details: null,
        });
      }

      const body = request.body;

      if (
        !body ||
        typeof body.numeroSuivi !==
          "string" ||
        body.numeroSuivi.trim() === ""
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "Le numéro de suivi est obligatoire et doit être valide.",
          details: null,
        });
      }

      const numeroSuivi =
        body.numeroSuivi.trim();

      const timbreId =
        session ===
        findEchange.proposantId
          ? findEchange.timbreOffertId
          : findEchange.timbreDemandeId;

      const resultat =
        await prisma.$transaction(
          async (tx) => {
            // Empêcher deux déclarations de modifier
            // le même échange simultanément.
            const verification =
              await tx.echange.updateMany({
                where: {
                  id: identif,
                  etape: "ACCEPTE",
                },

                data: {
                  version: {
                    increment: 1,
                  },
                },
              });

            if (
              verification.count !== 1
            ) {
              throw erreurHttp(
                409,
                "L'échange ne permet plus de déclarer un envoi.",
              );
            }

            // Vérifier si ce membre a déjà déclaré son colis.
            const envoiExistant =
              await tx.envoi.findFirst({
                where: {
                  echangeId: identif,
                  timbreId: timbreId,
                  sens: "ALLER",
                },
              });

            if (envoiExistant) {
              throw erreurHttp(
                409,
                "L'envoi de ce timbre a déjà été déclaré.",
              );
            }

            const nouvelEnvoi =
              await tx.envoi.create({
                data: {
                  echangeId: identif,
                  timbreId: timbreId,
                  sens: "ALLER",
                  numeroSuivi:
                    numeroSuivi,
                  dateEnvoi:
                    new Date(),
                },
              });

            const nombreEnvoisAller =
              await tx.envoi.count({
                where: {
                  echangeId: identif,
                  sens: "ALLER",
                },
              });

            if (
              nombreEnvoisAller === 2
            ) {
              const miseAjour =
                await tx.echange.updateMany({
                  where: {
                    id: identif,
                    etape: "ACCEPTE",
                  },

                  data: {
                    etape:
                      "TIMBRES_ENVOYES",

                    version: {
                      increment: 1,
                    },
                  },
                });

              if (
                miseAjour.count !== 1
              ) {
                throw erreurHttp(
                  409,
                  "L'échange ne permet plus de déclarer cet envoi.",
                );
              }

              await tx.notification.create({
                data: {
                  utilisateurId:
                    findEchange.proposantId,

                  echangeId:
                    identif,

                  type:
                    "ECHANGE",

                  titre:
                    "Timbres envoyés",

                  contenu:
                    "Les deux timbres ont été déclarés comme envoyés.",
                },
              });

              await tx.notification.create({
                data: {
                  utilisateurId:
                    findEchange.destinataireId,

                  echangeId:
                    identif,

                  type:
                    "ECHANGE",

                  titre:
                    "Timbres envoyés",

                  contenu:
                    "Les deux timbres ont été déclarés comme envoyés.",
                },
              });
            }

            return nouvelEnvoi;
          },
        );

      return reply.code(200).send({
        code: 200,
        message:
          "Envoi déclaré avec succès.",
        details: resultat,
      });
    },
  );
}