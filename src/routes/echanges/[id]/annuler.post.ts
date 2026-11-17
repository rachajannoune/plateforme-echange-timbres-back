import type { FastifyInstance } from "fastify";
import { prisma } from "../../../utils/db.js";
import { exigerUtilisateurActif } from "../../../utils/session.js";

type ParamsEchange = {
  id: string;
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

export async function routeAnnulerEchange(
  fastify: FastifyInstance,
) {
  fastify.post<{
    Params: ParamsEchange;
  }>(
    "/api/echanges/:id/annuler",
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

      if (utilisateur.role !== "MEMBRE") {
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
        findEchange.proposantId
      ) {
        return reply.code(403).send({
          code: 403,
          message:
            "Seul le proposant peut annuler cette proposition.",
          details: null,
        });
      }

      if (
        findEchange.etape !==
        "EN_ATTENTE"
      ) {
        return reply.code(409).send({
          code: 409,
          message:
            "Cette proposition ne peut plus être annulée.",
          details: null,
        });
      }

      const resultat =
        await prisma.$transaction(
          async (tx) => {
            const annulation =
              await tx.echange.updateMany({
                where: {
                  id: identif,
                  proposantId: session,
                  etape: "EN_ATTENTE",
                },

                data: {
                  etape: "ANNULE",

                  version: {
                    increment: 1,
                  },
                },
              });

            if (
              annulation.count !== 1
            ) {
              throw erreurHttp(
                409,
                "Cette proposition ne peut plus être annulée.",
              );
            }

            const echangeAnnule =
              await tx.echange.findUniqueOrThrow({
                where: {
                  id: identif,
                },
              });

            await tx.timbre.updateMany({
              where: {
                id:
                  findEchange.timbreOffertId,

                statut: "RESERVE",
              },

              data: {
                statut: "DISPONIBLE",

                version: {
                  increment: 1,
                },
              },
            });

            const autreProposition =
              await tx.echange.findFirst({
                where: {
                  timbreDemandeId:
                    findEchange
                      .timbreDemandeId,

                  etape: "EN_ATTENTE",

                  id: {
                    not: identif,
                  },
                },
              });

            if (!autreProposition) {
              await tx.timbre.updateMany({
                where: {
                  id:
                    findEchange
                      .timbreDemandeId,

                  statut:
                    "EN_ATTENTE",
                },

                data: {
                  statut:
                    "DISPONIBLE",

                  version: {
                    increment: 1,
                  },
                },
              });
            }

            await tx.notification.create({
              data: {
                utilisateurId:
                  findEchange.destinataireId,

                echangeId:
                  identif,

                type:
                  "ECHANGE",

                titre:
                  "Proposition annulée",

                contenu:
                  "La proposition d'échange a été annulée par le proposant.",
              },
            });

            return echangeAnnule;
          },
        );

      return reply.code(200).send({
        code: 200,
        message:
          "Proposition annulée avec succès.",
        details: resultat,
      });
    },
  );
}
