import type { FastifyInstance } from "fastify";
import { prisma } from "../../../../utils/db.js";
import { exigerUtilisateurActif } from "../../../../utils/session.js";

type ParamsEchange = {
  id: string;
};

export async function routeListeMessages(
  fastify: FastifyInstance,
) {
  fastify.get<{
    Params: ParamsEchange;
  }>(
    "/api/echanges/:id/messages",
    async (request, reply) => {
      const utilisateur =
        await exigerUtilisateurActif(
          request,
          reply,
        );

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

      const echange =
        await prisma.echange.findUnique({
          where: {
            id: identif,
          },
        });

      if (!echange) {
        return reply.code(404).send({
          code: 404,
          message:
            "Échange introuvable.",
          details: null,
        });
      }

      if (
        utilisateur.id !==
          echange.proposantId &&
        utilisateur.id !==
          echange.destinataireId
      ) {
        return reply.code(403).send({
          code: 403,
          message:
            "Vous n'êtes pas autorisé à consulter cette conversation.",
          details: null,
        });
      }

      const listeMessages =
        await prisma.message.findMany({
          where: {
            echangeId: identif,
            masque: false,
          },

          orderBy: {
            dateEnvoi: "asc",
          },

          select: {
            id: true,
            contenu: true,
            dateEnvoi: true,
            dateLecture: true,

            auteur: {
              select: {
                id: true,
                prenom: true,
                nom: true,
              },
            },
          },
        });

      return reply.code(200).send({
        code: 200,
        message:
          "Liste des messages récupérée avec succès.",
        details: listeMessages,
      });
    },
  );
}