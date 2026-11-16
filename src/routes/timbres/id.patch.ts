import type { FastifyInstance } from "fastify";
import { prisma } from "../../utils/db.js";
import { exigerUtilisateurActif } from "../../utils/session.js";

type ParamsTimbre = {
  id: string;
};

type CorpsModificationTimbre = {
  titre?: unknown;
  theme?: unknown;
  pays?: unknown;
  annee?: unknown;
  valeurFaciale?: unknown;
  coteEstimee?: unknown;
  couleurImpression?: unknown;
  rarete?: unknown;
  etat?: unknown;
  referenceCatalogue?: unknown;
};

export async function routeModifierTimbre(
  fastify: FastifyInstance,
) {
  fastify.patch<{
    Params: ParamsTimbre;
    Body: CorpsModificationTimbre;
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
            "Vous n'êtes pas autorisé à modifier ce timbre.",
          details: null,
        });
      }

      if (
        timbre.statut !== "DISPONIBLE" &&
        timbre.statut !== "SUSPENDU"
      ) {
        return reply.code(409).send({
          code: 409,
          message:
            "Ce timbre ne peut pas être modifié dans son état actuel.",
          details: null,
        });
      }

      const body = request.body;

      if (
        !body ||
        typeof body !== "object"
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "Les données de modification sont invalides.",
          details: null,
        });
      }

      if (
        (
          body.titre !== undefined &&
          (
            typeof body.titre !== "string" ||
            body.titre.trim() === ""
          )
        ) ||
        (
          body.theme !== undefined &&
          (
            typeof body.theme !== "string" ||
            body.theme.trim() === ""
          )
        ) ||
        (
          body.pays !== undefined &&
          (
            typeof body.pays !== "string" ||
            body.pays.trim() === ""
          )
        ) ||
        (
          body.valeurFaciale !== undefined &&
          (
            typeof body.valeurFaciale !== "string" ||
            body.valeurFaciale.trim() === ""
          )
        ) ||
        (
          body.couleurImpression !== undefined &&
          (
            typeof body.couleurImpression !== "string" ||
            body.couleurImpression.trim() === ""
          )
        )
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "Un ou plusieurs champs fournis sont invalides.",
          details: null,
        });
      }

      if (
        body.annee !== undefined &&
        (
          !Number.isInteger(body.annee) ||
          (body.annee as number) <= 0
        )
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "L'année du timbre est invalide.",
          details: null,
        });
      }

      if (
        body.coteEstimee !== undefined &&
        (
          !Number.isInteger(
            body.coteEstimee,
          ) ||
          (body.coteEstimee as number) < 0
        )
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "La cote estimée est invalide.",
          details: null,
        });
      }

      const raretesValides = [
        "COURANT",
        "RECHERCHE",
        "RARE",
      ] as const;

      if (
        body.rarete !== undefined &&
        !raretesValides.includes(
          body.rarete as
            typeof raretesValides[number],
        )
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "La rareté du timbre est invalide.",
          details: null,
        });
      }

      const etatsValides = [
        "NEUF",
        "NEUF_SANS_GOMME",
        "OBLITERE",
      ] as const;

      if (
        body.etat !== undefined &&
        !etatsValides.includes(
          body.etat as
            typeof etatsValides[number],
        )
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "L'état du timbre est invalide.",
          details: null,
        });
      }

      if (
        body.referenceCatalogue !==
          undefined &&
        body.referenceCatalogue !== null &&
        typeof body.referenceCatalogue !==
          "string"
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "La référence catalogue est invalide.",
          details: null,
        });
      }

      if (
        body.titre === undefined &&
        body.theme === undefined &&
        body.pays === undefined &&
        body.annee === undefined &&
        body.valeurFaciale === undefined &&
        body.coteEstimee === undefined &&
        body.couleurImpression === undefined &&
        body.rarete === undefined &&
        body.etat === undefined &&
        body.referenceCatalogue === undefined
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "Aucun champ à modifier n'a été fourni.",
          details: null,
        });
      }

      const updateTimbre =
        await prisma.timbre.updateMany({
          where: {
            id: identif,
            proprietaireId:
              utilisateur.id,
            statut: {
              in: [
                "DISPONIBLE",
                "SUSPENDU",
              ],
            },
          },

          data: {
            titre:
              body.titre as
                string | undefined,

            theme:
              body.theme as
                string | undefined,

            pays:
              body.pays as
                string | undefined,

            annee:
              body.annee as
                number | undefined,

            valeurFaciale:
              body.valeurFaciale as
                string | undefined,

            coteEstimee:
              body.coteEstimee as
                number | undefined,

            couleurImpression:
              body.couleurImpression as
                string | undefined,

            rarete:
              body.rarete as
                typeof raretesValides[number] |
                undefined,

            etat:
              body.etat as
                typeof etatsValides[number] |
                undefined,

            referenceCatalogue:
              body.referenceCatalogue as
                string | null | undefined,

            version: {
              increment: 1,
            },
          },
        });

      if (updateTimbre.count !== 1) {
        return reply.code(409).send({
          code: 409,
          message:
            "Le timbre ne peut plus être modifié.",
          details: null,
        });
      }

      const timbreModifie =
        await prisma.timbre.findUnique({
          where: {
            id: identif,
          },
        });

      return reply.code(200).send({
        code: 200,
        message:
          "Timbre modifié avec succès.",
        details: timbreModifie,
      });
    },
  );
}