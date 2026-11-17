import type { FastifyInstance } from "fastify";
import { prisma } from "../../../../utils/db.js";
import { exigerUtilisateurActif } from "../../../../utils/session.js";
import { EtapeEchange } from "../../../../../generated/prisma/enums.js";

type ParamsEchange = {
  id: string;
};

type CorpsRenvoi = {
  numeroSuiviOffert?: unknown;
  numeroSuiviDemande?: unknown;
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

export async function routeRenvoiEchange(
  fastify: FastifyInstance,
) {
  fastify.put<{
    Params: ParamsEchange;
    Body: CorpsRenvoi;
  }>(
    "/api/moderation/echanges/:id/renvoi",
    async (request, reply) => {
      const identif = request.params.id;
      const body = request.body;

      if (
        !body ||
        typeof body !== "object"
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "Les informations  de renvoi sont obligatoires.",
          details: null,
        });
      }

      const numeroSuiviOffert =
        body.numeroSuiviOffert;

      const numeroSuiviDemande =
        body.numeroSuiviDemande;

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
          EtapeEchange.VALIDE &&
        echange.etape !==
          EtapeEchange.REJETE
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "Cet échange n'est pas dans un état permettant le renvoi.",
          details: null,
        });
      }

      if (
        typeof numeroSuiviDemande !==
          "string" ||
        numeroSuiviDemande.trim() === ""
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "Le numéro de suivi du timbre demandé est obligatoire.",
          details: null,
        });
      }

      if (
        typeof numeroSuiviOffert !==
          "string" ||
        numeroSuiviOffert.trim() === ""
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "Le numéro de suivi du timbre offert est obligatoire.",
          details: null,
        });
      }

      // Valeurs déjà validées comme string.
      // Ces constantes conservent le typage dans la transaction.
      const suiviOffert =
        numeroSuiviOffert.trim();

      const suiviDemande =
        numeroSuiviDemande.trim();

      const echangeMisAJour =
        await prisma.$transaction(
          async (tx) => {
            const verification =
              await tx.echange.updateMany({
                where: {
                  id: identif,

                  etape: {
                    in: [
                      EtapeEchange.VALIDE,
                      EtapeEchange.REJETE,
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
                "Le renvoi a déjà été enregistré ou n'est plus autorisé.",
              );
            }

            await tx.envoi.createMany({
              data: [
                {
                  echangeId:
                    identif,

                  timbreId:
                    echange.timbreOffertId,

                  sens:
                    "RETOUR",

                  numeroSuivi:
                    suiviOffert,

                  dateEnvoi:
                    new Date(),
                },

                {
                  echangeId:
                    identif,

                  timbreId:
                    echange.timbreDemandeId,

                  sens:
                    "RETOUR",

                  numeroSuivi:
                    suiviDemande,

                  dateEnvoi:
                    new Date(),
                },
              ],
            });

            if (
              echange.etape ===
              EtapeEchange.VALIDE
            ) {
              await tx.timbre.update({
                where: {
                  id:
                    echange.timbreDemandeId,
                },

                data: {
                  proprietaireId:
                    echange.proposantId,

                  statut:
                    "DISPONIBLE",
                },
              });

              await tx.timbre.update({
                where: {
                  id:
                    echange.timbreOffertId,
                },

                data: {
                  proprietaireId:
                    echange.destinataireId,

                  statut:
                    "DISPONIBLE",
                },
              });
            }

            if (
              echange.etape ===
              EtapeEchange.REJETE
            ) {
              await tx.timbre.updateMany({
                where: {
                  id: {
                    in: [
                      echange.timbreOffertId,
                      echange.timbreDemandeId,
                    ],
                  },

                  statut:
                    "EN_ECHANGE",
                },

                data: {
                  statut:
                    "DISPONIBLE",
                },
              });
            }

            return await tx.echange.update({
              where: {
                id: identif,
              },

              data: {
                etape:
                  EtapeEchange.CONCLU,

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
          "Renvoi enregistré avec succès.",
        details:
          echangeMisAJour,
      });
    },
  );
}