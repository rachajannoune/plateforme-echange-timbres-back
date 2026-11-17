import type { FastifyInstance } from "fastify";
import { prisma } from "../../../../utils/db.js";
import { exigerUtilisateurActif } from "../../../../utils/session.js";

type ParamsEchange = {
  id: string;
};

type CorpsReception = {
  timbreId?: unknown;
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

export async function routeReceptionEchange(
  fastify: FastifyInstance,
) {
  fastify.post<{
    Params: ParamsEchange;
    Body: CorpsReception;
  }>(
    "/api/moderation/echanges/:id/reception",
    async (request, reply) => {
      const identif = request.params.id;

      if (!identif) {
        return reply.code(400).send({
          code: 400,
          message:
            "Identifiant de l'échange manquant.",
          details: null,
        });
      }

      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      if (!uuidRegex.test(identif)) {
        return reply.code(400).send({
          code: 400,
          message:
            "Identifiant de l'échange invalide.",
          details: null,
        });
      }

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

      const body = request.body;

      if (
        !body ||
        typeof body.timbreId !==
          "string" ||
        !uuidRegex.test(body.timbreId)
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "Identifiant du timbre invalide ou manquant.",
          details: null,
        });
      }

      /*
       * La valeur vient d'être validée comme string.
       * Cette constante permet simplement à TypeScript
       * de conserver ce type dans la transaction Prisma.
       */
      const timbreId = body.timbreId;

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
        echange.etape !==
        "TIMBRES_ENVOYES"
      ) {
        return reply.code(409).send({
          code: 409,
          message:
            "Cet échange ne peut pas être réceptionné.",
          details: null,
        });
      }

      if (
        timbreId !==
          echange.timbreOffertId &&
        timbreId !==
          echange.timbreDemandeId
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "Ce timbre ne fait pas partie de cet échange.",
          details: null,
        });
      }

      const resultat =
        await prisma.$transaction(
          async (tx) => {
            /*
             * Synchroniser les réceptions
             * de cet échange.
             */
            const verification =
              await tx.echange.updateMany({
                where: {
                  id: identif,
                  etape:
                    "TIMBRES_ENVOYES",
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
                "Cet échange ne peut plus être réceptionné.",
              );
            }

            /*
             * Enregistrer uniquement
             * le colis arrivé.
             */
            const reception =
              await tx.envoi.updateMany({
                where: {
                  echangeId:
                    identif,

                  timbreId:
                    timbreId,

                  sens:
                    "ALLER",

                  dateReception:
                    null,
                },

                data: {
                  dateReception:
                    new Date(),
                },
              });

            if (
              reception.count !== 1
            ) {
              throw erreurHttp(
                409,
                "Ce colis est introuvable ou déjà réceptionné.",
              );
            }

            /*
             * Vérifier si les deux colis
             * ont été reçus.
             */
            const nombreColisRecus =
              await tx.envoi.count({
                where: {
                  echangeId:
                    identif,

                  sens:
                    "ALLER",

                  dateReception: {
                    not: null,
                  },
                },
              });

            if (
              nombreColisRecus === 2
            ) {
              const miseAJour =
                await tx.echange.updateMany({
                  where: {
                    id: identif,

                    etape:
                      "TIMBRES_ENVOYES",
                  },

                  data: {
                    etape:
                      "TIMBRES_RECUS",

                    version: {
                      increment: 1,
                    },
                  },
                });

              if (
                miseAJour.count !== 1
              ) {
                throw erreurHttp(
                  409,
                  "L'échange ne peut plus passer à l'expertise.",
                );
              }
            }

            return await tx.echange
              .findUniqueOrThrow({
                where: {
                  id: identif,
                },
              });
          },
        );

      return reply.code(200).send({
        code: 200,
        message:
          "Réception enregistrée avec succès.",
        details: resultat,
      });
    },
  );
}