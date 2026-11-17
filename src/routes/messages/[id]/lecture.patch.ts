import type { FastifyInstance } from "fastify";
import { prisma } from "../../../utils/db.js";
import { exigerUtilisateurActif } from "../../../utils/session.js";

type ParamsMessage = {
  id: string;
};

export async function routeLectureMessage(
  fastify: FastifyInstance,
) {
  fastify.patch<{
    Params: ParamsMessage;
  }>(
    "/api/messages/:id/lecture",
    async (request, reply) => {
      const user =
        await exigerUtilisateurActif(
          request,
          reply,
        );

      const identif = request.params.id;

      if (!identif) {
        return reply.code(400).send({
          code: 400,
          message:
            "Identifiant du message manquant.",
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
            "Identifiant du message invalide.",
          details: null,
        });
      }

      const message =
        await prisma.message.findUnique({
          where: {
            id: identif,
          },
        });

      if (!message) {
        return reply.code(404).send({
          code: 404,
          message:
            "Message introuvable.",
          details: null,
        });
      }

      const echange =
        await prisma.echange.findUnique({
          where: {
            id: message.echangeId,
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
        user.id !== echange.proposantId &&
        user.id !== echange.destinataireId
      ) {
        return reply.code(403).send({
          code: 403,
          message:
            "Vous n'êtes pas autorisé à modifier ce message.",
          details: null,
        });
      }

      if (message.dateLecture) {
        return reply.code(400).send({
          code: 400,
          message:
            "Le message est déjà marqué comme lu.",
          details: null,
        });
      }

      const modification =
        await prisma.message.updateMany({
          where: {
            id: identif,
            dateLecture: null,
          },

          data: {
            dateLecture: new Date(),
          },
        });

      if (modification.count !== 1) {
        return reply.code(409).send({
          code: 409,
          message:
            "Ce message a déjà été marqué comme lu.",
          details: null,
        });
      }

      const messageMisAJour =
        await prisma.message.findUnique({
          where: {
            id: identif,
          },
        });

      return reply.code(200).send({
        code: 200,
        message:
          "Message marqué comme lu.",
        details: messageMisAJour,
      });
    },
  );
}