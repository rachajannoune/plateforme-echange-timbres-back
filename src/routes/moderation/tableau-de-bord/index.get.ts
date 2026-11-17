import type { FastifyInstance } from "fastify";
import { prisma } from "../../../utils/db.js";
import { exigerUtilisateurActif } from "../../../utils/session.js";

export async function routeTableauDeBordModeration(
  fastify: FastifyInstance,
) {
  fastify.get(
    "/api/moderation/tableau-de-bord",
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

      const nombreReceptionsEnAttente =
        await prisma.echange.count({
          where: {
            etape: "TIMBRES_ENVOYES",
          },
        });

      const nombreExpertisesEnAttente =
        await prisma.echange.count({
          where: {
            etape: "TIMBRES_RECUS",
          },
        });

      const nombreRenvoisEnAttente =
        await prisma.echange.count({
          where: {
            etape: "VALIDE",
          },
        });

      return reply.code(200).send({
        code: 200,
        message:
          "Tableau de bord récupéré avec succès.",
        details: {
          receptionsEnAttente:
            nombreReceptionsEnAttente,

          expertisesEnAttente:
            nombreExpertisesEnAttente,

          renvoisEnAttente:
            nombreRenvoisEnAttente,
        },
      });
    },
  );
}