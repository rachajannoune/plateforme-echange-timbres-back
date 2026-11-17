import type { FastifyInstance } from "fastify";
import { prisma } from "../../../utils/db.js";
import { exigerUtilisateurActif } from "../../../utils/session.js";

export async function routeListeReceptions(
  fastify: FastifyInstance,
) {
  fastify.get(
    "/api/moderation/receptions",
    async (request, reply) => {
      const utilisateur =
        await exigerUtilisateurActif(
          request,
          reply,
        );

      if (
        utilisateur.role !==
        "MODERATEUR"
      ) {
        return reply.code(403).send({
          code: 403,
          message:
            "Vous n'êtes pas autorisé à accéder à cette ressource.",
          details: null,
        });
      }

      const listesReceptionsEnAttente =
        await prisma.echange.findMany({
          where: {
            etape:
              "TIMBRES_ENVOYES",
          },

          orderBy: {
            dateCreation: "asc",
          },

          include: {
            proposant: {
              select: {
                id: true,
                prenom: true,
                nom: true,
              },
            },

            destinataire: {
              select: {
                id: true,
                prenom: true,
                nom: true,
              },
            },

            timbreOffert: {
              select: {
                id: true,
                titre: true,
                etat: true,
                coteEstimee: true,

                photos: {
                  where: {
                    face: "RECTO",
                  },

                  select: {
                    chemin: true,
                  },
                },
              },
            },

            timbreDemande: {
              select: {
                id: true,
                titre: true,
                etat: true,
                coteEstimee: true,

                photos: {
                  where: {
                    face: "RECTO",
                  },

                  select: {
                    chemin: true,
                  },
                },
              },
            },

            envois: {
              select: {
                id: true,
                numeroSuivi: true,
                dateEnvoi: true,
                sens: true,
                timbreId: true,
              },
            },
          },
        });

      return reply.code(200).send({
        code: 200,
        message:
          "Liste des réceptions récupérée avec succès.",
        details:
          listesReceptionsEnAttente,
      });
    },
  );
}