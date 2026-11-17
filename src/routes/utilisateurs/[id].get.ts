import type { FastifyInstance } from "fastify";
import { prisma } from "../../utils/db.js";
import { exigerUtilisateurActif } from "../../utils/session.js";

type ParamsUtilisateur = {
  id: string;
};

export async function routeDetailUtilisateur(
  fastify: FastifyInstance,
) {
  fastify.get<{
    Params: ParamsUtilisateur;
  }>(
    "/api/utilisateurs/:id",
    async (request, reply) => {
      await exigerUtilisateurActif(
        request,
        reply,
      );

      const identif = request.params.id;

      if (!identif) {
        return reply.code(400).send({
          code: 400,
          message:
            "Identifiant de l'utilisateur manquant.",
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
            "Identifiant de l'utilisateur invalide.",
          details: null,
        });
      }

      const utilisateur =
        await prisma.utilisateur.findUnique({
          where: {
            id: identif,
          },

          select: {
            id: true,
            prenom: true,
            ville: true,
            dateInscription: true,
          },
        });

      if (!utilisateur) {
        return reply.code(404).send({
          code: 404,
          message:
            "Utilisateur introuvable.",
          details: null,
        });
      }

      return {
        id: utilisateur.id,
        prenom: utilisateur.prenom,
        ville: utilisateur.ville,
        anciennete:
          utilisateur.dateInscription,
      };
    },
  );
}