import type { FastifyInstance } from "fastify";
import { prisma } from "../../utils/db.js";
import { lireSession } from "../../utils/session.js";

export async function routeMoi(fastify: FastifyInstance) {
  fastify.get(
    "/api/auth/moi",
    async (request, reply) => {
      const session = await lireSession(request, reply);

      if (!session) {
        return reply.code(401).send({
          code: 401,
          message: "Connexion expirée. Veuillez vous reconnecter.",
          details: null,
        });
      }

      const utilisateur =
        await prisma.utilisateur.findUnique({
          where: {
            id: session,
          },
        });

      if (!utilisateur) {
        return reply.code(401).send({
          code: 401,
          message: "Session invalide.",
          details: null,
        });
      }

      if (utilisateur.statut === "SUSPENDU") {
        return reply.code(403).send({
          code: 403,
          message: "Compte suspendu.",
          details: null,
        });
      }

      return {
        id: utilisateur.id,
        prenom: utilisateur.prenom,
        nom: utilisateur.nom,
        email: utilisateur.email,
        ville: utilisateur.ville,
        role: utilisateur.role,
        statut: utilisateur.statut,
        dateAcceptationChart:
          utilisateur.dateAcceptationChart,
        dateInscription:
          utilisateur.dateInscription,
      };
    },
  );
}
