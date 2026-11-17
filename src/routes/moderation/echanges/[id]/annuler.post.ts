import type { FastifyInstance } from "fastify";
import { prisma } from "../../../../utils/db.js";
import { exigerUtilisateurActif } from "../../../../utils/session.js";
import { EtapeEchange } from "../../../../../generated/prisma/enums.js";

type ParamsEchange = {
  id: string;
};

type CorpsAnnulation = {
  motif?: unknown;
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

export async function routeAnnulerEchangeModeration(
  fastify: FastifyInstance,
) {
  fastify.post<{
    Params: ParamsEchange;
    Body: CorpsAnnulation;
  }>(
    "/api/moderation/echanges/:id/annuler",
    async (request, reply) => {
      const identif = request.params.id;

      const body = request.body;

      const motifannulation =
        body?.motif;

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
          EtapeEchange.EN_ATTENTE &&
        echange.etape !==
          EtapeEchange.ACCEPTE
      ) {
        return reply.code(409).send({
          code: 409,
          message:
            "Cet échange ne peut pas être annulé par cette procédure.",
          details: null,
        });
      }

      if (
        typeof motifannulation !==
          "string" ||
        motifannulation.trim() === ""
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "Le motif d'annulation est obligatoire.",
          details: null,
        });
      }

      /*
       * Le motif vient d'être validé.
       * On le stabilise pour la callback Prisma.
       */
      const motif =
        motifannulation.trim();

      const echangeMisAJour =
        await prisma.$transaction(
          async (tx) => {
            // Protéger l'annulation contre deux actions simultanées.
            const verification =
              await tx.echange.updateMany({
                where: {
                  id: identif,

                  etape: {
                    in: [
                      EtapeEchange.EN_ATTENTE,
                      EtapeEchange.ACCEPTE,
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
                "Cet échange ne peut plus être annulé.",
              );
            }

            // Récupérer les envois déclarés pour cet échange.
            const envois =
              await tx.envoi.findMany({
                where: {
                  echangeId:
                    identif,

                  sens:
                    "ALLER",
                },
              });

            if (envois.length >= 2) {
              throw erreurHttp(
                409,
                "Les deux colis ont déjà été envoyés.",
              );
            }

            // Vérifier le délai lorsqu'un seul colis a été envoyé.
            if (envois.length === 1) {
              const dateActuelle =
                new Date();

              if (
                !echange.dateLimiteEnvoi ||
                dateActuelle.getTime() <=
                  echange.dateLimiteEnvoi.getTime()
              ) {
                throw erreurHttp(
                  409,
                  "Le délai d'envoi n'est pas encore dépassé.",
                );
              }
            }

            // Identifier le timbre envoyé.
            let offertEnvoye = false;
            let demandeEnvoye = false;

            for (const envoi of envois) {
              if (
                envoi.timbreId ===
                echange.timbreOffertId
              ) {
                offertEnvoye = true;
              }

              if (
                envoi.timbreId ===
                echange.timbreDemandeId
              ) {
                demandeEnvoye = true;
              }
            }

            // Libérer le timbre offert s'il n'a pas été envoyé.
            if (!offertEnvoye) {
              await tx.timbre.updateMany({
                where: {
                  id:
                    echange.timbreOffertId,

                  statut: {
                    in: [
                      "RESERVE",
                      "EN_ECHANGE",
                    ],
                  },
                },

                data: {
                  statut:
                    "DISPONIBLE",

                  version: {
                    increment: 1,
                  },
                },
              });
            }

            // Vérifier les autres propositions concernant le timbre demandé.
            const autreProposition =
              await tx.echange.findFirst({
                where: {
                  timbreDemandeId:
                    echange.timbreDemandeId,

                  etape:
                    EtapeEchange.EN_ATTENTE,

                  id: {
                    not: identif,
                  },
                },
              });

            // Libérer le timbre demandé uniquement s'il n'a pas été envoyé
            // et qu'aucune autre proposition n'existe.
            if (
              !demandeEnvoye &&
              !autreProposition
            ) {
              await tx.timbre.updateMany({
                where: {
                  id:
                    echange.timbreDemandeId,

                  statut: {
                    in: [
                      "EN_ATTENTE",
                      "EN_ECHANGE",
                    ],
                  },
                },

                data: {
                  statut:
                    "DISPONIBLE",

                  version: {
                    increment: 1,
                  },
                },
              });
            }

            return await tx.echange.update({
              where: {
                id: identif,
              },

              data: {
                etape:
                  EtapeEchange.ANNULE,

                motifAnnulation:
                  motif,

                version: {
                  increment: 1,
                },
              },
            });
          },
        );

      return reply.code(200).send({
        code: 200,
        message:
          "Échange annulé avec succès.",
        details:
          echangeMisAJour,
      });
    },
  );
}