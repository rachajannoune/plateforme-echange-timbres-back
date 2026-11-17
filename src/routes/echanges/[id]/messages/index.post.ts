import type { FastifyInstance } from "fastify";
import { EtapeEchange } from "../../../../../generated/prisma/enums.js";
import { prisma } from "../../../../utils/db.js";
import { exigerUtilisateurActif } from "../../../../utils/session.js";

type ParamsEchange = {
  id: string;
};

type CorpsMessage = {
  contenu?: unknown;
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

export async function routeCreerMessage(
  fastify: FastifyInstance,
) {
  fastify.post<{
    Params: ParamsEchange;
    Body: CorpsMessage;
  }>(
    "/api/echanges/:id/messages",
    async (request, reply) => {
      const utilisateur =
        await exigerUtilisateurActif(
          request,
          reply,
        );

      const identif = request.params.id;
      const body = request.body;

      const contenu =
        typeof body?.contenu === "string"
          ? body.contenu.trim()
          : "";

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

      if (
        echange.etape ===
          EtapeEchange.CONCLU ||
        echange.etape ===
          EtapeEchange.ANNULE ||
        echange.etape ===
          EtapeEchange.REJETE ||
        echange.etape ===
          EtapeEchange.REFUSE
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "Cette conversation est en lecture seule.",
          details: null,
        });
      }

      if (!contenu) {
        return reply.code(400).send({
          code: 400,
          message:
            "Le contenu du message est obligatoire.",
          details: null,
        });
      }

      const messageCree =
        await prisma.$transaction(
          async (tx) => {
            const verification =
              await tx.echange.updateMany({
                where: {
                  id: identif,

                  etape: {
                    notIn: [
                      EtapeEchange.CONCLU,
                      EtapeEchange.ANNULE,
                      EtapeEchange.REJETE,
                      EtapeEchange.REFUSE,
                    ],
                  },
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
                "Cette conversation est en lecture seule.",
              );
            }

            const message =
              await tx.message.create({
                data: {
                  echangeId: identif,
                  auteurId:
                    utilisateur.id,
                  contenu,
                },
              });

            const notifier =
              utilisateur.id ===
              echange.proposantId
                ? echange.destinataireId
                : echange.proposantId;

            await tx.notification.create({
              data: {
                utilisateurId:
                  notifier,

                echangeId:
                  identif,

                type:
                  "MESSAGE",

                titre:
                  "Nouveau message reçu",

                contenu,
              },
            });

            return message;
          },
        );

      return reply.code(201).send({
        code: 201,
        message:
          "Message envoyé avec succès.",
        details: messageCree,
      });
    },
  );
}