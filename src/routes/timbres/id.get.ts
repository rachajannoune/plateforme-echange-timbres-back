import type { FastifyInstance } from "fastify";
import { prisma } from "../../utils/db.js";

type ParamsTimbre = {
  id: string;
};

export async function routeDetailTimbre(
  fastify: FastifyInstance,
) {
  fastify.get<{ Params: ParamsTimbre }>(
    "/api/timbres/:id",
    async (request, reply) => {
      const identif = request.params.id;

      if (!identif) {
        return reply.code(400).send({
          code: 400,
          message: "Identifiant du timbre manquant.",
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
          message: "Identifiant du timbre invalide.",
          details: null,
        });
      }

      const timbre = await prisma.timbre.findUnique({
        where: {
          id: identif,
        },

        include: {
          proprietaire: {
            select: {
              id: true,
              prenom: true,
              ville: true,
            },
          },

          photos: {
            select: {
              id: true,
              face: true,
              chemin: true,
              typeMime: true,
            },
          },
        },
      });

      if (!timbre) {
        return reply.code(404).send({
          code: 404,
          message: "Timbre introuvable.",
          details: null,
        });
      }

      if (timbre.statut === "SUSPENDU") {
        return reply.code(404).send({
          code: 404,
          message: "Timbre introuvable.",
          details: null,
        });
      }

      return timbre;
    },
  );
}
