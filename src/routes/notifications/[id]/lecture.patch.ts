import type { FastifyInstance } from "fastify";
import { prisma } from "../../../utils/db.js";
import { exigerUtilisateurActif } from "../../../utils/session.js";

type ParamsNotification = {
  id: string;
};

export async function routeLectureNotification(
  fastify: FastifyInstance,
) {
  fastify.patch<{
    Params: ParamsNotification;
  }>(
    "/api/notifications/:id/lecture",
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
            "Identifiant de la notification manquant.",
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
            "Identifiant de la notification invalide.",
          details: null,
        });
      }

      const notification =
        await prisma.notification.findUnique({
          where: {
            id: identif,
          },
        });

      if (!notification) {
        return reply.code(404).send({
          code: 404,
          message:
            "notification introuvable.",
          details: null,
        });
      }

      if (
        utilisateur.id !==
        notification.utilisateurId
      ) {
        return reply.code(403).send({
          code: 403,
          message:
            "Vous n'êtes pas autorisé à modifier cette notification.",
          details: null,
        });
      }

      if (notification.lue) {
        return reply.code(400).send({
          code: 400,
          message:
            "Notification déjà marquée comme lue.",
          details: null,
        });
      }

      const modification =
        await prisma.notification.updateMany({
          where: {
            id: identif,

            utilisateurId:
              utilisateur.id,

            lue: false,
          },

          data: {
            lue: true,
          },
        });

      if (modification.count !== 1) {
        return reply.code(409).send({
          code: 409,
          message:
            "Cette notification a déjà été marquée comme lue.",
          details: null,
        });
      }

      const notificationMiseAJour =
        await prisma.notification.findUnique({
          where: {
            id: identif,
          },
        });

      return reply.code(200).send({
        code: 200,
        message:
          "Notification marquée comme lue.",
        details:
          notificationMiseAJour,
      });
    },
  );
}