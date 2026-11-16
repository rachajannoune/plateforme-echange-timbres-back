import type { FastifyInstance } from "fastify";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { prisma } from "../../utils/db.js";
import { creerSession } from "../../utils/session.js";

type CorpsConnexion = {
  email?: unknown;
  motDePasse?: unknown;
};

export async function routeConnexion(fastify: FastifyInstance) {
  fastify.post<{ Body: CorpsConnexion }>(
    "/api/auth/connexion",
    async (request, reply) => {
      const body = request.body;

      if (
        !body ||
        typeof body !== "object" ||
        typeof body.email !== "string" ||
        body.email.trim().length === 0 ||
        typeof body.motDePasse !== "string" ||
        body.motDePasse.length === 0
      ) {
        return reply.code(400).send({
          code: 400,
          message: "Email et mot de passe obligatoires ou invalides.",
          details: null,
        });
      }

      const utilisateur = await prisma.utilisateur.findUnique({
        where: {
          email: body.email.trim(),
        },
      });

      if (!utilisateur) {
        return reply.code(401).send({
          code: 401,
          message: "Identifiants invalides.",
          details: null,
        });
      }

      function extractSaltAndHash(input: string) {
        const parts = input.split("$");

        if (parts.length !== 3 || !parts[1] || !parts[2]) {
          return null;
        }

        return {
          sel: parts[1],
          hash: parts[2],
        };
      }

      const resultat = extractSaltAndHash(
        utilisateur.motDePasseHash,
      );

      if (!resultat) {
        return reply.code(500).send({
          code: 500,
          message: "Erreur interne.",
          details: null,
        });
      }

      const { sel, hash } = resultat;

      const hashCalcule = scryptSync(
        body.motDePasse,
        sel,
        64,
      );

      const hashStocke = Buffer.from(hash, "hex");

      const motDePasseValide =
        /^[0-9a-f]{128}$/i.test(hash) &&
        hashStocke.length === hashCalcule.length &&
        timingSafeEqual(hashCalcule, hashStocke);

      if (!motDePasseValide) {
        return reply.code(401).send({
          code: 401,
          message: "Identifiants invalides.",
          details: null,
        });
      }

      if (utilisateur.statut === "SUSPENDU") {
        return reply.code(403).send({
          code: 403,
          message: "Compte suspendu.",
          details: null,
        });
      }

      await creerSession(
        request,
        reply,
        utilisateur.id,
      );

      return {
        id: utilisateur.id,
        prenom: utilisateur.prenom,
        nom: utilisateur.nom,
        email: utilisateur.email,
        role: utilisateur.role,
        statut: utilisateur.statut,
      };
    },
  );
}
