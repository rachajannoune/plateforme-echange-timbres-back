import type { FastifyInstance } from "fastify";
import {
  lireSession,
  supprimerSession,
} from "../../utils/session.js";

export async function routeDeconnexion(
  fastify: FastifyInstance,
) {
  fastify.post(
    "/api/auth/deconnexion",
    async (request, reply) => {
      const session = await lireSession(
        request,
        reply,
      );

      if (!session) {
        return reply.code(401).send({
          code: 401,
          message:
            "Connexion expirée. Veuillez vous reconnecter.",
          details: null,
        });
      }

      await supprimerSession(request, reply);

      return reply.code(200).send({
        code: 200,
        message: "Déconnexion réussie.",
        details: null,
      });
    },
  );
}
