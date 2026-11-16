import type { FastifyInstance } from "fastify";
import { prisma } from "../../utils/db.js";
import { exigerUtilisateurActif } from "../../utils/session.js";
import { unlink } from "node:fs/promises";
import { join } from "node:path";

type ParamsTimbre = {
  id: string;
};

function erreurHttp(
  statusCode: number,
  message: string,
) {
  const erreur = new Error(message);

  Object.assign(erreur, {
    statusCode,
  });

  return erreur;
}

export async function routeSupprimerTimbre(
  fastify: FastifyInstance,
) {
  fastify.delete<{
    Params: ParamsTimbre;
  }>(
    "/api/timbres/:id",
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
            "Identifiant du timbre manquant.",
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
            "Identifiant du timbre invalide.",
          details: null,
        });
      }

      const timbre =
        await prisma.timbre.findUnique({
          where: {
            id: identif,
          },

          include: {
            photos: {
              select: {
                chemin: true,
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

      if (
        timbre.proprietaireId !==
        utilisateur.id
      ) {
        return reply.code(403).send({
          code: 403,
          message:
            "Vous n'êtes pas autorisé à supprimer ce timbre.",
          details: null,
        });
      }

      if (
        timbre.statut !== "DISPONIBLE"
      ) {
        return reply.code(409).send({
          code: 409,
          message:
            "Ce timbre ne peut être supprimé que lorsqu'il est disponible.",
          details: null,
        });
      }

      const photos =
        await prisma.$transaction(
          async (tx) => {
            const verification =
              await tx.timbre.updateMany({
                where: {
                  id: identif,

                  proprietaireId:
                    utilisateur.id,

                  statut:
                    "DISPONIBLE",
                },

                data: {
                  version: {
                    increment: 1,
                  },
                },
              });

            if (
              verification.count !== 1
            ) {
              throw erreurHttp(
                409,
                "Le timbre ne peut plus être supprimé.",
              );
            }

            const echangeExistant =
              await tx.echange.findFirst({
                where: {
                  OR: [
                    {
                      timbreOffertId:
                        identif,
                    },
                    {
                      timbreDemandeId:
                        identif,
                    },
                  ],
                },
              });

            if (echangeExistant) {
              throw erreurHttp(
                409,
                "Ce timbre possède un historique d'échange et ne peut pas être supprimé.",
              );
            }

            await tx.photoTimbre.deleteMany({
              where: {
                timbreId: identif,
              },
            });

            const suppression =
              await tx.timbre.deleteMany({
                where: {
                  id: identif,

                  proprietaireId:
                    utilisateur.id,

                  statut:
                    "DISPONIBLE",
                },
              });

            if (
              suppression.count !== 1
            ) {
              throw erreurHttp(
                409,
                "Le timbre ne peut plus être supprimé.",
              );
            }

            return timbre.photos;
          },
        );

      for (const photo of photos) {
        const cheminFichier = join(
          process.cwd(),
          "public",
          photo.chemin,
        );

        try {
          await unlink(cheminFichier);
        } catch {
          // Le fichier peut déjà ne plus exister.
        }
      }

      return reply.code(200).send({
        code: 200,
        message:
          "Timbre supprimé avec succès.",
        details: null,
      });
    },
  );
}