import type { FastifyInstance } from "fastify";
import { prisma } from "../../../utils/db.js";
import { exigerUtilisateurActif } from "../../../utils/session.js";

type ParamsEchange = {
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

export async function routeAccepterEchange(
  fastify: FastifyInstance,
) {
  fastify.post<{
    Params: ParamsEchange;
  }>(
    "/api/echanges/:id/accepter",
    async (request, reply) => {
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

      const utilisateur =
        await exigerUtilisateurActif(
          request,
          reply,
        );

      const session =
        utilisateur.id;

      if (
        utilisateur.role !== "MEMBRE"
      ) {
        return reply.code(403).send({
          code: 403,
          message:
            "Action réservée aux membres.",
          details: null,
        });
      }

      const findEchange =
        await prisma.echange.findUnique({
          where: {
            id: identif,
          },
        });

      if (!findEchange) {
        return reply.code(404).send({
          code: 404,
          message:
            "Échange introuvable.",
          details: null,
        });
      }

      if (
        session !==
        findEchange.destinataireId
      ) {
        return reply.code(403).send({
          code: 403,
          message:
            "Seul le destinataire peut accepter cette proposition.",
          details: null,
        });
      }

      if (
        findEchange.etape !==
        "EN_ATTENTE"
      ) {
        return reply.code(409).send({
          code: 409,
          message:
            "Cette proposition ne peut plus être acceptée.",
          details: null,
        });
      }

      const timbres =
        await prisma.timbre.findMany({
          where: {
            id: {
              in: [
                findEchange.timbreOffertId,
                findEchange.timbreDemandeId,
              ],
            },
          },
        });

      const timbreOffert =
        timbres.find(
          (timbre) =>
            timbre.id ===
            findEchange.timbreOffertId,
        );

      const timbreDemande =
        timbres.find(
          (timbre) =>
            timbre.id ===
            findEchange.timbreDemandeId,
        );

      if (
        !timbreOffert ||
        !timbreDemande
      ) {
        return reply.code(404).send({
          code: 404,
          message:
            "Un ou plusieurs timbres de l'échange sont introuvables.",
          details: null,
        });
      }

      if (
        timbreOffert.proprietaireId !==
        findEchange.proposantId
      ) {
        return reply.code(409).send({
          code: 409,
          message:
            "Le timbre offert n'appartient plus au proposant.",
          details: null,
        });
      }

      if (
        timbreDemande.proprietaireId !==
        session
      ) {
        return reply.code(409).send({
          code: 409,
          message:
            "Le timbre demandé n'appartient plus au destinataire.",
          details: null,
        });
      }

      if (
        timbreDemande.statut !==
          "DISPONIBLE" &&
        timbreDemande.statut !==
          "EN_ATTENTE"
      ) {
        return reply.code(409).send({
          code: 409,
          message:
            "Le timbre demandé ne peut pas participer à cet échange dans son état actuel.",
          details: null,
        });
      }

      if (
        timbreOffert.statut !==
        "RESERVE"
      ) {
        return reply.code(409).send({
          code: 409,
          message:
            "Le timbre offert n'est plus réservé pour cette proposition.",
          details: null,
        });
      }

      const dateAcceptation =
        new Date();

      const dateLimiteEnvoi =
        new Date(dateAcceptation);

      dateLimiteEnvoi.setDate(
        dateLimiteEnvoi.getDate() + 3,
      );

      const resultat =
        await prisma.$transaction(
          async (tx) => {
            const acceptation =
              await tx.echange.updateMany({
                where: {
                  id: identif,
                  destinataireId:
                    session,
                  etape:
                    "EN_ATTENTE",
                },

                data: {
                  etape:
                    "ACCEPTE",

                  dateAcceptation:
                    dateAcceptation,

                  dateLimiteEnvoi:
                    dateLimiteEnvoi,

                  version: {
                    increment: 1,
                  },
                },
              });

            if (
              acceptation.count !== 1
            ) {
              throw erreurHttp(
                409,
                "Cette proposition ne peut plus être acceptée.",
              );
            }

            const echangeAccepte =
              await tx.echange
                .findUniqueOrThrow({
                  where: {
                    id: identif,
                  },
                });

            // 1. Vérifier que le timbre offert est toujours réservé.
            // Si oui, le passer à EN_ECHANGE.
            const timbreOffertModifie =
              await tx.timbre.updateMany({
                where: {
                  id:
                    findEchange
                      .timbreOffertId,

                  statut:
                    "RESERVE",
                },

                data: {
                  statut:
                    "EN_ECHANGE",
                },
              });

            // 2. Vérifier que le timbre demandé est encore disponible.
            // Si oui, le passer à EN_ECHANGE.
            const timbreDemandeModifie =
              await tx.timbre.updateMany({
                where: {
                  id:
                    findEchange
                      .timbreDemandeId,

                  statut: {
                    in: [
                      "DISPONIBLE",
                      "EN_ATTENTE",
                    ],
                  },
                },

                data: {
                  statut:
                    "EN_ECHANGE",
                },
              });

            // 3. Si un des deux timbres n'a pas été modifié,
            // annuler toute la transaction pour éviter un échange incorrect.
            if (
              timbreOffertModifie.count !==
                1 ||
              timbreDemandeModifie.count !==
                1
            ) {
              throw erreurHttp(
                409,
                "Un des timbres n'est plus disponible pour cet échange.",
              );
            }

            const propositionsConcurrents =
              await tx.echange.findMany({
                where: {
                  id: {
                    not: identif,
                  },

                  etape:
                    "EN_ATTENTE",

                  OR: [
                    {
                      timbreOffertId: {
                        in: [
                          findEchange
                            .timbreOffertId,

                          findEchange
                            .timbreDemandeId,
                        ],
                      },
                    },

                    {
                      timbreDemandeId: {
                        in: [
                          findEchange
                            .timbreOffertId,

                          findEchange
                            .timbreDemandeId,
                        ],
                      },
                    },
                  ],
                },

                select: {
                  id: true,
                  timbreOffertId:
                    true,
                },
              });

            await tx.echange.updateMany({
              where: {
                id: {
                  in:
                    propositionsConcurrents.map(
                      (
                        proposition,
                      ) =>
                        proposition.id,
                    ),
                },
              },

              data: {
                etape:
                  "ANNULE",

                motifAnnulation:
                  "Proposition annulée automatiquement car un échange concurrent a été accepté.",
              },
            });

            const timbresAReLiberer =
              propositionsConcurrents
                .map(
                  (proposition) =>
                    proposition
                      .timbreOffertId,
                )
                .filter(
                  (timbreId) =>
                    timbreId !==
                      findEchange
                        .timbreOffertId &&
                    timbreId !==
                      findEchange
                        .timbreDemandeId,
                );

            if (
              timbresAReLiberer.length >
              0
            ) {
              await tx.timbre.updateMany({
                where: {
                  id: {
                    in:
                      timbresAReLiberer,
                  },
                },

                data: {
                  statut:
                    "DISPONIBLE",
                },
              });
            }

            await tx.notification.create({
              data: {
                utilisateurId:
                  findEchange
                    .proposantId,

                echangeId:
                  identif,

                type:
                  "ECHANGE",

                titre:
                  "Proposition acceptée",

                contenu:
                  "Votre proposition d'échange a été acceptée.",
              },
            });

            return echangeAccepte;
          },
        );

      return reply.code(200).send({
        code: 200,
        message:
          "Proposition acceptée avec succès.",
        details: resultat,
      });
    },
  );
}