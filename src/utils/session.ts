import type { FastifyReply, FastifyRequest } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./db.js";

const dureeSession = 60 * 60 * 24;
const formatJeton = /^[0-9a-f]{64}$/;

function empreinteJeton(jeton: string) {
  return createHash("sha256").update(jeton).digest("hex");
}

export async function creerSession(
  request: FastifyRequest,
  reply: FastifyReply,
  utilisateurId: string,
) {
  await supprimerSession(request, reply);

  const jeton = randomBytes(32).toString("hex");
  const dateExpiration = new Date(
    Date.now() + dureeSession * 1000,
  );

  await prisma.session.create({
    data: {
      jetonHash: empreinteJeton(jeton),
      utilisateurId,
      dateExpiration,
    },
  });

  reply.setCookie("session", jeton, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: dureeSession,
    expires: dateExpiration,
    path: "/",
  });
}

export async function lireSession(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<string | undefined> {
  const jeton = request.cookies.session;

  if (!jeton) {
    return undefined;
  }

  if (!formatJeton.test(jeton)) {
    reply.clearCookie("session", { path: "/" });
    return undefined;
  }

  const session = await prisma.session.findUnique({
    where: {
      jetonHash: empreinteJeton(jeton),
    },
    select: {
      utilisateurId: true,
      dateExpiration: true,
    },
  });

  if (!session) {
    reply.clearCookie("session", { path: "/" });
    return undefined;
  }

  if (session.dateExpiration.getTime() <= Date.now()) {
    await supprimerSession(request, reply);
    return undefined;
  }

  return session.utilisateurId;
}

export async function supprimerSession(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const jeton = request.cookies.session;

  if (jeton && formatJeton.test(jeton)) {
    await prisma.session.deleteMany({
      where: {
        jetonHash: empreinteJeton(jeton),
      },
    });
  }

  reply.clearCookie("session", {
    path: "/",
  });
}

export async function exigerUtilisateurActif(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const utilisateurId = await lireSession(request, reply);

  if (!utilisateurId) {
    const erreur = new Error("Session invalide ou expirée.");
    Object.assign(erreur, { statusCode: 401 });
    throw erreur;
  }

  const utilisateur = await prisma.utilisateur.findUnique({
    where: {
      id: utilisateurId,
    },
  });

  if (!utilisateur) {
    const erreur = new Error("Utilisateur introuvable.");
    Object.assign(erreur, { statusCode: 401 });
    throw erreur;
  }

  if (utilisateur.statut === "SUSPENDU") {
    const erreur = new Error("Compte suspendu.");
    Object.assign(erreur, { statusCode: 403 });
    throw erreur;
  }

  return utilisateur;
}
