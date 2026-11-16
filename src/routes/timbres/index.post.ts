import type { FastifyInstance } from "fastify";
import {
  mkdir,
  writeFile,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { prisma } from "../../utils/db.js";
import { exigerUtilisateurActif } from "../../utils/session.js";

type PartieFichier = {
  data: Buffer;
  type: string;
};

export async function routeCreerTimbre(
  fastify: FastifyInstance,
) {
  fastify.post(
    "/api/timbres",
    async (request, reply) => {
      const utilisateur =
        await exigerUtilisateurActif(
          request,
          reply,
        );

      let recto: PartieFichier | undefined;
      let verso: PartieFichier | undefined;

      const champs = new Map<string, Buffer>();

      /*
       * Équivalent Fastify de readMultipartFormData(event).
       * On récupère toutes les parties du formulaire :
       * champs texte + recto + verso.
       */
      for await (const partie of request.parts()) {
        if (partie.type === "file") {
          const data = await partie.toBuffer();

          if (partie.fieldname === "recto") {
            recto = {
              data,
              type: partie.mimetype,
            };
          }

          if (partie.fieldname === "verso") {
            verso = {
              data,
              type: partie.mimetype,
            };
          }
        } else {
          champs.set(
            partie.fieldname,
            Buffer.from(
              String(partie.value),
              "utf8",
            ),
          );
        }
      }

      const partieTitre = champs.get("titre");

      const titre = partieTitre
        ? partieTitre
            .toString("utf8")
            .trim()
        : "";

      const partieTheme = champs.get("theme");

      const theme = partieTheme
        ? partieTheme
            .toString("utf8")
            .trim()
        : "";

      const partiePays = champs.get("pays");

      const pays = partiePays
        ? partiePays
            .toString("utf8")
            .trim()
        : "";

      const partieAnnee =
        champs.get("annee");

      const annee = partieAnnee
        ? Number(
            partieAnnee.toString("utf8"),
          )
        : 0;

      const partieCoteEstimee =
        champs.get("coteEstimee");

      const coteEstimee =
        partieCoteEstimee
          ? Number(
              partieCoteEstimee.toString(
                "utf8",
              ),
            )
          : -1;

      const partieValeurFaciale =
        champs.get("valeurFaciale");

      const valeurFaciale =
        partieValeurFaciale
          ? partieValeurFaciale
              .toString("utf8")
              .trim()
          : "";

      const partieCouleurImpression =
        champs.get(
          "couleurImpression",
        );

      const couleurImpression =
        partieCouleurImpression
          ? partieCouleurImpression
              .toString("utf8")
              .trim()
          : "";

      const partieRarete =
        champs.get("rarete");

      const rarete = partieRarete
        ? partieRarete
            .toString("utf8")
            .trim()
        : "";

      const partieEtat =
        champs.get("etat");

      const etat = partieEtat
        ? partieEtat
            .toString("utf8")
            .trim()
        : "";

      const partieReferenceCatalogue =
        champs.get(
          "referenceCatalogue",
        );

      const referenceCatalogue =
        partieReferenceCatalogue
          ? partieReferenceCatalogue
              .toString("utf8")
              .trim() || null
          : null;

      /*
       * Validation des champs obligatoires.
       * Logique identique à l'ancienne API.
       */
      if (
        !titre ||
        !theme ||
        !pays ||
        !partieAnnee ||
        !valeurFaciale ||
        !partieCoteEstimee ||
        !couleurImpression ||
        !rarete ||
        !etat ||
        !recto ||
        !verso
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "Tous les champs obligatoires doivent être renseignés.",
          details: null,
        });
      }

      /*
       * Validation année.
       */
      if (
        !Number.isInteger(annee) ||
        annee <= 0
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "L'année du timbre est invalide.",
          details: null,
        });
      }

      /*
       * Validation cote estimée.
       */
      if (
        !Number.isInteger(coteEstimee) ||
        coteEstimee < 0
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

      /*
       * Validation rareté.
       */
      if (
        !raretesValides.includes(
          rarete as
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

      /*
       * Validation état.
       */
      if (
        !etatsValides.includes(
          etat as
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

      const typesImagesValides = [
        "image/jpeg",
        "image/png",
        "image/webp",
      ];

      /*
       * Validation MIME.
       */
      if (
        !recto.type ||
        !typesImagesValides.includes(
          recto.type,
        ) ||
        !verso.type ||
        !typesImagesValides.includes(
          verso.type,
        )
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "Les photos doivent être au format JPEG, PNG ou WebP.",
          details: null,
        });
      }

      const tailleMax =
        5 * 1024 * 1024;

      /*
       * CORRECTION 1 :
       * refuser les fichiers vides et
       * ceux supérieurs à 5 Mo.
       */
      if (
        recto.data.length === 0 ||
        verso.data.length === 0 ||
        recto.data.length >
          tailleMax ||
        verso.data.length >
          tailleMax
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "Chaque photo doit avoir une taille comprise entre 1 octet et 5 Mo.",
          details: null,
        });
      }

      const typeMimeRecto =
        recto.type;

      const typeMimeVerso =
        verso.type;

      /*
       * CORRECTION 2 :
       * vérifier le contenu réel
       * des images.
       */
      function verifierImage(
        data: Buffer,
        type: string,
      ) {
        if (type === "image/jpeg") {
          return (
            data.length >= 4 &&
            data[0] === 0xff &&
            data[1] === 0xd8 &&
            data[2] === 0xff &&
            data[data.length - 2] ===
              0xff &&
            data[data.length - 1] ===
              0xd9
          );
        }

        if (type === "image/png") {
          return (
            data.length >= 8 &&
            data
              .subarray(0, 8)
              .equals(
                Buffer.from([
                  137,
                  80,
                  78,
                  71,
                  13,
                  10,
                  26,
                  10,
                ]),
              )
          );
        }

        if (type === "image/webp") {
          return (
            data.length >= 12 &&
            data.toString(
              "ascii",
              0,
              4,
            ) === "RIFF" &&
            data.toString(
              "ascii",
              8,
              12,
            ) === "WEBP"
          );
        }

        return false;
      }

      if (
        !verifierImage(
          recto.data,
          recto.type,
        ) ||
        !verifierImage(
          verso.data,
          verso.type,
        )
      ) {
        return reply.code(400).send({
          code: 400,
          message:
            "Le contenu des photos est invalide.",
          details: null,
        });
      }

      const dossierUploads = join(
        process.cwd(),
        "public",
        "uploads",
        "timbres",
      );

      await mkdir(
        dossierUploads,
        {
          recursive: true,
        },
      );

      const extensionRecto =
        recto.type === "image/png"
          ? ".png"
          : recto.type ===
              "image/webp"
            ? ".webp"
            : ".jpg";

      const extensionVerso =
        verso.type === "image/png"
          ? ".png"
          : verso.type ===
              "image/webp"
            ? ".webp"
            : ".jpg";

      const nomRecto =
        `${randomUUID()}-recto${extensionRecto}`;

      const nomVerso =
        `${randomUUID()}-verso${extensionVerso}`;

      const fichierRecto = join(
        dossierUploads,
        nomRecto,
      );

      const fichierVerso = join(
        dossierUploads,
        nomVerso,
      );

      const cheminRecto =
        `/uploads/timbres/${nomRecto}`;

      const cheminVerso =
        `/uploads/timbres/${nomVerso}`;

      /*
       * CORRECTION 3 :
       * nettoyage des fichiers
       * lorsqu'une erreur survient.
       */
      try {
        await writeFile(
          fichierRecto,
          recto.data,
          {
            flag: "wx",
          },
        );

        await writeFile(
          fichierVerso,
          verso.data,
          {
            flag: "wx",
          },
        );

        /*
         * Création du timbre et
         * de ses photos dans une
         * transaction Prisma.
         */
        const timbreCree =
          await prisma.$transaction(
            async (tx) => {
              const timbre =
                await tx.timbre.create({
                  data: {
                    proprietaireId:
                      utilisateur.id,

                    titre,
                    theme,
                    pays,
                    annee,
                    valeurFaciale,
                    coteEstimee,
                    couleurImpression,

                    rarete:
                      rarete as
                        typeof raretesValides[number],

                    etat:
                      etat as
                        typeof etatsValides[number],

                    referenceCatalogue,
                  },
                });

              await tx.photoTimbre.createMany({
                data: [
                  {
                    timbreId:
                      timbre.id,

                    face: "RECTO",

                    chemin:
                      cheminRecto,

                    typeMime:
                      typeMimeRecto,

                    tailleOctets:
                      recto.data.length,
                  },

                  {
                    timbreId:
                      timbre.id,

                    face: "VERSO",

                    chemin:
                      cheminVerso,

                    typeMime:
                      typeMimeVerso,

                    tailleOctets:
                      verso.data.length,
                  },
                ],
              });

              return await tx.timbre.findUnique(
                {
                  where: {
                    id: timbre.id,
                  },

                  include: {
                    photos: {
                      select: {
                        id: true,
                        face: true,
                        chemin: true,
                        typeMime: true,
                        tailleOctets: true,
                      },
                    },
                  },
                },
              );
            },
          );

        return reply.code(201).send({
          code: 201,
          message:
            "Timbre ajouté avec succès.",
          details: timbreCree,
        });
      } catch (erreur) {
        await unlink(
          fichierRecto,
        ).catch(() => {});

        await unlink(
          fichierVerso,
        ).catch(() => {});

        throw erreur;
      }
    },
  );
}