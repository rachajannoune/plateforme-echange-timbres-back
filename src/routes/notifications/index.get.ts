import type { FastifyInstance } from "fastify";
import { prisma } from "../../utils/db.js";
import { exigerUtilisateurActif } from "../../utils/session.js";

export async function routeListeNotifications(
  fastify: FastifyInstance,
) {
  fastify.get(
    "/api/notifications",
    async (request, reply) => {
      const utilisateur =
        await exigerUtilisateurActif(
          request,
          reply,
        );

      const listeNotifications =
        await prisma.notification.findMany({
          where: {
            utilisateurId:
              utilisateur.id,
          },

          orderBy: {
            dateCreation: "desc",
          },
        });

      return reply.code(200).send({
        code: 200,
        message:
          "Notifications récupérées avec succès.",
        details: listeNotifications,
      });
    },
  );
}