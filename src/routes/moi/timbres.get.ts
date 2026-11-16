import type { FastifyInstance } from "fastify";
import { prisma } from "../../utils/db.js";
import { exigerUtilisateurActif } from "../../utils/session.js";

type QueryMesTimbres = {
  page?: string;
  taille?: string;
  statut?: string;
};

export async function routeMesTimbres(
  fastify: FastifyInstance,
) {
  fastify.get<{
    Querystring: QueryMesTimbres;
  }>(
    "/api/moi/timbres",
    async (request, reply) => {
      const query = request.query;

      const pageDemandee =
        Number(query.page);

      const tailleDemandee =
        Number(query.taille);

      const page =
        Number.isInteger(pageDemandee) &&
        pageDemandee > 0
          ? pageDemandee
          : 1;

      const taille =
        Number.isInteger(tailleDemandee) &&
        tailleDemandee > 0 &&
        tailleDemandee <= 50
          ? tailleDemandee
          : 10;

      const skip =
        (page - 1) * taille;

      const statutsValides = [
        "DISPONIBLE",
        "EN_ATTENTE",
        "SUSPENDU",
        "RESERVE",
        "EN_ECHANGE",
      ] as const;

      const statut =
        query.statut &&
        statutsValides.includes(
          query.statut as
            typeof statutsValides[number],
        )
          ? (
              query.statut as
                typeof statutsValides[number]
            )
          : undefined;

      const utilisateur =
        await exigerUtilisateurActif(
          request,
          reply,
        );

      const timbres =
        await prisma.timbre.findMany({
          where: {
            proprietaireId:
              utilisateur.id,

            statut,
          },

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

          orderBy: {
            id: "desc",
          },

          skip,
          take: taille,
        });

      const total =
        await prisma.timbre.count({
          where: {
            proprietaireId:
              utilisateur.id,

            statut,
          },
        });

      return {
        page,
        taille,
        total,
        items: timbres,
      };
    },
  );
}
