import type { FastifyInstance } from "fastify";
import { prisma } from "../../../../utils/db.js";
import { exigerUtilisateurActif } from "../../../../utils/session.js";
import {
  ResultatExpertise,
  EtapeEchange,
} from "../../../../../generated/prisma/enums.js";

type ParamsEchange = {
  id: string;
};

type CorpsExpertise = {
  resultatOffert?: unknown;
  resultatDemande?: unknown;
  motif?: unknown;
  etatCorrige?: unknown;
  coteCorrigee?: unknown;
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

export async function routeExpertiseEchange(
  fastify: FastifyInstance,
) {
  fastify.post<{
    Params: ParamsEchange;
    Body: CorpsExpertise;
  }>(
    "/api/moderation/echanges/:id/expertise",
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
            "Les informations  de lexpertise sont obligatoires.",
          details: null,
        });
      }

      const resultatOffert =
        body.resultatOffert;

      const resultatDemande =
        body.resultatDemande;

      const motif =
        body.motif;

      const etatCorrige =
        body.etatCorrige;

      const coteCorrigee =
        body.coteCorrigee;

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
        EtapeEchange.TIMBRES_RECUS
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "Cet échange ne peut pas être expertisé.",
          details: null,
        });
      }

      if (
        resultatOffert !==
          ResultatExpertise.CONFORME &&
        resultatOffert !==
          ResultatExpertise.NON_CONFORME
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "Le résultat de l'expertise du timbre offert est invalide.",
          details: null,
        });
      }

      if (
        resultatDemande !==
          ResultatExpertise.CONFORME &&
        resultatDemande !==
          ResultatExpertise.NON_CONFORME
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "Le résultat de l'expertise du timbre demandé est invalide.",
          details: null,
        });
      }

      if (
        (
          resultatDemande ===
            ResultatExpertise.NON_CONFORME ||
          resultatOffert ===
            ResultatExpertise.NON_CONFORME
        ) &&
        (
          typeof motif !== "string" ||
          motif.trim() === ""
        )
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "Le motif est obligatoire en cas de non-conformité.",
          details: null,
        });
      }

      const etapeFinale =
        resultatOffert ===
          ResultatExpertise.CONFORME &&
        resultatDemande ===
          ResultatExpertise.CONFORME
          ? EtapeEchange.VALIDE
          : EtapeEchange.REJETE;

      const echangeMisAJour =
        await prisma.$transaction(
          async (tx) => {
            const verification =
              await tx.echange.updateMany({
                where: {
                  id: identif,

                  etape:
                    EtapeEchange.TIMBRES_RECUS,
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
                "Cet échange a déjà été expertisé ou n'est plus disponible.",
              );
            }

            await tx.expertise.createMany({
              data: [
                {
                  echangeId:
                    identif,

                  timbreId:
                    echange.timbreDemandeId,

                  resultat:
                    resultatDemande,

                  motif:
                    resultatDemande ===
                    ResultatExpertise.NON_CONFORME
                      ? motif as string
                      : null,

                  etatCorrige:
                    resultatDemande ===
                    ResultatExpertise.NON_CONFORME
                      ? etatCorrige as any
                      : null,

                  coteCorrigee:
                    resultatDemande ===
                    ResultatExpertise.NON_CONFORME
                      ? coteCorrigee as number | null | undefined
                      : null,
                },

                {
                  echangeId:
                    identif,

                  timbreId:
                    echange.timbreOffertId,

                  resultat:
                    resultatOffert,

                  motif:
                    resultatOffert ===
                    ResultatExpertise.NON_CONFORME
                      ? motif as string
                      : null,

                  etatCorrige:
                    resultatOffert ===
                    ResultatExpertise.NON_CONFORME
                      ? etatCorrige as any
                      : null,

                  coteCorrigee:
                    resultatOffert ===
                    ResultatExpertise.NON_CONFORME
                      ? coteCorrigee as number | null | undefined
                      : null,
                },
              ],
            });

            if (
              etapeFinale ===
              EtapeEchange.VALIDE
            ) {
              await tx.timbre.update({
                where: {
                  id:
                    echange.timbreOffertId,
                },

                data: {
                  expertise: true,
                },
              });

              await tx.timbre.update({
                where: {
                  id:
                    echange.timbreDemandeId,
                },

                data: {
                  expertise: true,
                },
              });
            }

            if (
              resultatOffert ===
              ResultatExpertise.NON_CONFORME
            ) {
              await tx.timbre.update({
                where: {
                  id:
                    echange.timbreOffertId,
                },

                data: {
                  statut:
                    "SUSPENDU",
                },
              });
            }

            if (
              resultatDemande ===
              ResultatExpertise.NON_CONFORME
            ) {
              await tx.timbre.update({
                where: {
                  id:
                    echange.timbreDemandeId,
                },

                data: {
                  statut:
                    "SUSPENDU",
                },
              });
            }

            return await tx.echange.update({
              where: {
                id: identif,
              },

              data: {
                etape:
                  etapeFinale,

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
          "Expertise enregistrée avec succès.",
        details:
          echangeMisAJour,
      });
    },
  );
}