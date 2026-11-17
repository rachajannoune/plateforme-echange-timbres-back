import type { FastifyInstance } from "fastify";
import { prisma } from "../../utils/db.js";
import { exigerUtilisateurActif } from "../../utils/session.js";

type ParamsEchange = {
  id: string;
};

export async function routeDetailEchange(
  fastify: FastifyInstance,
) {
  fastify.get<{
    Params: ParamsEchange;
  }>(
    "/api/echanges/:id",
    async (request, reply) => {
      const utilisateur =
        await exigerUtilisateurActif(
          request,
          reply,
        );

      const identif =
        request.params.id;

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

          include: {
            timbreOffert: {
              include: {
                photos: {
                  select: {
                    id: true,
                    face: true,
                    chemin: true,
                    typeMime: true,
                  },
                },
              },
            },

            timbreDemande: {
              include: {
                photos: {
                  select: {
                    id: true,
                    face: true,
                    chemin: true,
                    typeMime: true,
                  },
                },
              },
            },

            proposant: {
              select: {
                id: true,
                prenom: true,
                ville: true,
              },
            },

            destinataire: {
              select: {
                id: true,
                prenom: true,
                ville: true,
              },
            },

            envois: {
              select: {
                id: true,
                timbreId: true,
                sens: true,
                numeroSuivi: true,
                dateEnvoi: true,
                dateReception: true,
                etatColis: true,
              },
            },
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
        echange.proposantId !==
          utilisateur.id &&
        echange.destinataireId !==
          utilisateur.id
      ) {
        return reply.code(403).send({
          code: 403,
          message:
            "Vous n'êtes pas autorisé à consulter cet échange.",
          details: null,
        });
      }

      return echange;
    },
  );
}