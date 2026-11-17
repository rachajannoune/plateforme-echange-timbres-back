import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { prisma } from "./utils/db.js";
import { routeInscription } from "./routes/auth/inscription.js";
import { routeConnexion } from "./routes/auth/connexion.js";
import { routeMoi } from "./routes/auth/moi.js";
import { routeDeconnexion } from "./routes/auth/deconnexion.js";
import { routeListeTimbres } from "./routes/timbres/index.get.js";
import { routeDetailTimbre } from "./routes/timbres/id.get.js";
import multipart from "@fastify/multipart";
import { routeCreerTimbre } from "./routes/timbres/index.post.js";
import { routeModifierTimbre } from "./routes/timbres/id.patch.js";
import { routeSupprimerTimbre } from "./routes/timbres/id.delete.js";
import { routeMesTimbres } from "./routes/moi/timbres.get.js";
import { routeCreerEchange } from "./routes/echanges/index.post.js";
import { routeListeEchanges } from "./routes/echanges/index.get.js";
import { routeDetailEchange } from "./routes/echanges/id.get.js";
import { routeAccepterEchange } from "./routes/echanges/[id]/accepter.post.js";
import { routeDeclarerEnvoi } from "./routes/echanges/[id]/envoi.put.js";
import { routeAnnulerEchange } from "./routes/echanges/[id]/annuler.post.js";
import { routeRefuserEchange } from "./routes/echanges/[id]/refuser.post.js";
import { routeListeMessages } from "./routes/echanges/[id]/messages/index.get.js";
import { routeCreerMessage } from "./routes/echanges/[id]/messages/index.post.js";
import { routeLectureMessage } from "./routes/messages/[id]/lecture.patch.js";
import { routeListeNotifications } from "./routes/notifications/index.get.js";
import { routeLectureNotification } from "./routes/notifications/[id]/lecture.patch.js";
import { routeTableauDeBordModeration } from "./routes/moderation/tableau-de-bord/index.get.js";
import { routeListeReceptions } from "./routes/moderation/receptions/index.get.js";
import { routeReceptionEchange } from "./routes/moderation/echanges/[id]/reception.post.js";
import { routeExpertiseEchange } from "./routes/moderation/echanges/[id]/expertise.post.js";
import { routeRenvoiEchange } from "./routes/moderation/echanges/[id]/renvoi.put.js";
import { routeAnnulerEchangeModeration } from "./routes/moderation/echanges/[id]/annuler.post.js";
import { routeRetourAnnulation } from "./routes/moderation/echanges/[id]/retour-annulation.post.js";
import { routeDetailUtilisateur } from "./routes/utilisateurs/[id].get.js";

const fastify = Fastify({
  logger: true,
});

await fastify.register(cookie);
await fastify.register(multipart, {
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 2,
  },
});

await fastify.register(routeInscription);
await fastify.register(routeConnexion);
await fastify.register(routeMoi);
await fastify.register(routeDeconnexion);
await fastify.register(routeListeTimbres);
await fastify.register(routeDetailTimbre);
await fastify.register(routeCreerTimbre);
await fastify.register(routeModifierTimbre);
await fastify.register(routeSupprimerTimbre);
await fastify.register(routeMesTimbres);
await fastify.register(routeCreerEchange);
await fastify.register(routeListeEchanges);
await fastify.register(routeDetailEchange);
await fastify.register(routeAccepterEchange);
await fastify.register(routeDeclarerEnvoi);
await fastify.register(routeAnnulerEchange);
await fastify.register(routeRefuserEchange);
await fastify.register(routeListeMessages);
await fastify.register(routeCreerMessage);
await fastify.register(routeLectureMessage);
await fastify.register(routeListeNotifications);
await fastify.register(routeLectureNotification);
await fastify.register(routeTableauDeBordModeration);
await fastify.register(routeListeReceptions);
await fastify.register(routeReceptionEchange);
await fastify.register(routeExpertiseEchange);
await fastify.register(routeRenvoiEchange);
await fastify.register(routeAnnulerEchangeModeration);
await fastify.register(routeRetourAnnulation);
await fastify.register(routeDetailUtilisateur);

fastify.get("/", async () => {
  return {
    message: "Backend Fastify opérationnel",
  };
});

fastify.get("/test-db", async () => {
  const total = await prisma.timbre.count();

  return {
    connexion: "OK",
    totalTimbres: total,
  };
});

const demarrer = async () => {
  try {
    await fastify.listen({
      port: 3000,
      host: "0.0.0.0",
    });
  } catch (erreur) {
    fastify.log.error(erreur);
    process.exit(1);
  }
};

demarrer();
