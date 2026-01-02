// src/features/requests/createRequest.js
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';

// origin = { lat, lng }, destination = { lat, lng }
export async function createRideRequest({ userId, origin, destination }) {
  return addDoc(collection(db, 'rideRequests'), {
    userId,
    origin,
    destination,
    status: 'pending',       // pending | accepted | enroute | completed | cancelled
    createdAt: serverTimestamp(),
  });
}
