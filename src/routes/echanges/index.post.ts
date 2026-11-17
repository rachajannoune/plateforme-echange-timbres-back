import type { FastifyInstance } from "fastify";
import { prisma } from "../../utils/db.js";
import { exigerUtilisateurActif } from "../../utils/session.js";

type CorpsEchange = {
  timbreOffertId?: unknown;
  timbreDemandeId?: unknown;
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

export async function routeCreerEchange(
  fastify: FastifyInstance,
) {
  fastify.post<{
    Body: CorpsEchange;
  }>(
    "/api/echanges",
    async (request, reply) => {
      const utilisateur =
        await exigerUtilisateurActif(
          request,
          reply,
        );

      if (utilisateur.role !== "MEMBRE") {
        return reply.code(403).send({
          code: 403,
          message:
            "Action réservée aux membres.",
          details: null,
        });
      }

      const session = utilisateur.id;

      const body = request.body;

      if (
        !body ||
        typeof body !== "object" ||
        typeof body.timbreOffertId !== "string" ||
        typeof body.timbreDemandeId !== "string"
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "Les identifiants des deux timbres sont obligatoires.",
          details: null,
        });
      }

      /*
       * Les deux identifiants viennent d'être validés
       * comme étant des chaînes de caractères.
       *
       * Ces constantes permettent à TypeScript
       * de conserver ce typage dans la transaction
       * Prisma asynchrone.
       */
      const timbreOffertId =
        body.timbreOffertId;

      const timbreDemandeId =
        body.timbreDemandeId;

      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      const timbreOffertValide =
        uuidRegex.test(
          timbreOffertId,
        );

      const timbreDemandeValide =
        uuidRegex.test(
          timbreDemandeId,
        );

      if (
        !timbreOffertValide ||
        !timbreDemandeValide
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "Identifiant de timbre invalide.",
          details: null,
        });
      }

      const timbres =
        await prisma.timbre.findMany({
          where: {
            id: {
              in: [
                timbreOffertId,
                timbreDemandeId,
              ],
            },
          },
        });

      const timbreOffert =
        timbres.find(
          (timbre) =>
            timbre.id ===
            timbreOffertId,
        );

      const timbreDemande =
        timbres.find(
          (timbre) =>
            timbre.id ===
            timbreDemandeId,
        );

      if (
        !timbreOffert ||
        !timbreDemande
      ) {
        return reply.code(404).send({
          code: 404,
          message:
            "Un ou plusieurs timbres sont introuvables.",
          details: null,
        });
      }

      if (
        timbreDemande.proprietaireId ===
        session
      ) {
        return reply.code(403).send({
          code: 403,
          message:
            "Vous ne pouvez pas demander l'un de vos propres timbres.",
          details: null,
        });
      }

      if (
        timbreOffert.proprietaireId !==
        session
      ) {
        return reply.code(403).send({
          code: 403,
          message:
            "Vous ne pouvez proposer qu'un timbre qui vous appartient.",
          details: null,
        });
      }

      if (
        timbreOffert.statut !==
          "DISPONIBLE" &&
        timbreOffert.statut !==
          "EN_ATTENTE"
      ) {
        return reply.code(409).send({
          code: 409,
          message:
            "Le timbre offert n'est pas disponible pour un échange.",
          details: null,
        });
      }

      if (
        timbreDemande.statut !==
          "DISPONIBLE" &&
        timbreDemande.statut !==
          "EN_ATTENTE"
      ) {
        return reply.code(409).send({
          code: 409,
          message:
            "Le timbre demandé n'est pas disponible pour un échange.",
          details: null,
        });
      }

      const findEchange =
        await prisma.echange.findFirst({
          where: {
            proposantId: session,
            timbreDemandeId:
              timbreDemandeId,
            etape: "EN_ATTENTE",
          },
        });

      if (findEchange) {
        return reply.code(409).send({
          code: 409,
          message:
            "Vous avez déjà une proposition en attente pour ce timbre.",
          details: null,
        });
      }

      const createProposition =
        await prisma.$transaction(
          async (tx) => {
            const reservation =
              await tx.timbre.updateMany({
                where: {
                  id:
                    timbreOffertId,

                  proprietaireId:
                    session,

                  statut: {
                    in: [
                      "DISPONIBLE",
                      "EN_ATTENTE",
                    ],
                  },
                },

                data: {
                  statut:
                    "RESERVE",

                  version: {
                    increment: 1,
                  },
                },
              });

            if (
              reservation.count !== 1
            ) {
              throw erreurHttp(
                409,
                "Le timbre offert n'est plus disponible.",
              );
            }

            const proposition =
              await tx.echange.create({
                data: {
                  proposantId:
                    session,

                  destinataireId:
                    timbreDemande
                      .proprietaireId,

                  timbreOffertId:
                    timbreOffertId,

                  timbreDemandeId:
                    timbreDemandeId,
                },
              });

            await tx.timbre.update({
              where: {
                id:
                  timbreDemandeId,
              },

              data: {
                statut:
                  "EN_ATTENTE",
              },
            });

            await tx.notification.create({
              data: {
                echangeId:
                  proposition.id,

                utilisateurId:
                  proposition.destinataireId,

                type:
                  "ECHANGE",

                titre:
                  "Nouvelle proposition d'échange",

                contenu:
                  "Vous avez reçu une nouvelle proposition d'échange.",
              },
            });

            return proposition;
          },
        );

      return reply.code(201).send({
        code: 201,
        message:
          "Proposition d'échange créée avec succès.",
        details:
          createProposition,
      });
    },
  );
}