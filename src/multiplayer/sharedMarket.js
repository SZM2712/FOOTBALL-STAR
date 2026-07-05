import { firebaseConfig } from './firebaseConfig.js';

// Se carga por CDN (import dinámico) en vez de por npm/bundler, siguiendo el
// resto del proyecto (vanilla ESM, sin paso de build). Si el SDK no carga
// (sin internet, CDN bloqueado, etc.) el resto del juego sigue funcionando
// con normalidad: el multijugador simplemente no está disponible.
const FIREBASE_SDK_VERSION = '10.13.0';

let firestoreApiPromise = null;

function loadFirestoreApi() {
  if (!firestoreApiPromise) {
    firestoreApiPromise = Promise.all([
      import(/* @vite-ignore */ `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
      import(/* @vite-ignore */ `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`),
    ]).then(([{ initializeApp }, firestoreMod]) => {
      const app = initializeApp(firebaseConfig);
      const db = firestoreMod.getFirestore(app);
      return { db, ...firestoreMod };
    });
  }
  return firestoreApiPromise;
}

/** Crea (si no existe) y te suma a una sala de mercado compartido. El código
 * de sala es cualquier palabra que acuerden los amigos, no se genera solo. */
export async function joinRoom(roomCode, playerName) {
  const { db, doc, setDoc, serverTimestamp } = await loadFirestoreApi();
  await setDoc(doc(db, 'rooms', roomCode), { updatedAt: serverTimestamp() }, { merge: true });
  await setDoc(doc(db, 'rooms', roomCode, 'players', playerName), { joinedAt: serverTimestamp() }, { merge: true });
}

/** Intenta reclamar un club para este jugador dentro de la sala (transacción
 * atómica: si dos jugadores lo intentan al mismo tiempo, solo uno gana).
 * Devuelve true si lo consiguió, false si ya estaba tomado por otro. */
export async function claimClub(roomCode, club, playerName) {
  const { db, doc, runTransaction, addDoc, collection, serverTimestamp } = await loadFirestoreApi();
  const claimRef = doc(db, 'rooms', roomCode, 'claims', club.id);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(claimRef);
      if (snap.exists()) throw new Error('TAKEN');
      tx.set(claimRef, { clubId: club.id, clubName: club.name, playerName, signedAt: serverTimestamp() });
    });
  } catch (e) {
    return false;
  }
  await addDoc(collection(db, 'rooms', roomCode, 'activity'), {
    text: `🔒 ${playerName} firmó con ${club.name}.`,
    ts: serverTimestamp(),
  });
  return true;
}

/** Se suscribe en tiempo real a los clubes ya tomados, la actividad reciente
 * y los jugadores presentes en la sala. Devuelve una función para
 * desuscribirse de las tres cosas a la vez. */
export async function subscribeRoom(roomCode, { onClaims, onActivity, onPlayers }) {
  const { db, collection, onSnapshot, query, orderBy, limit } = await loadFirestoreApi();

  const unsubClaims = onSnapshot(collection(db, 'rooms', roomCode, 'claims'), (snap) => {
    const ids = new Set();
    snap.forEach((d) => ids.add(d.id));
    onClaims(ids);
  });

  const activityQuery = query(collection(db, 'rooms', roomCode, 'activity'), orderBy('ts', 'desc'), limit(20));
  const unsubActivity = onSnapshot(activityQuery, (snap) => {
    const items = [];
    snap.forEach((d) => items.push(d.data()));
    onActivity(items.reverse());
  });

  const unsubPlayers = onSnapshot(collection(db, 'rooms', roomCode, 'players'), (snap) => {
    const names = [];
    snap.forEach((d) => names.push(d.id));
    onPlayers(names);
  });

  return () => {
    unsubClaims();
    unsubActivity();
    unsubPlayers();
  };
}
