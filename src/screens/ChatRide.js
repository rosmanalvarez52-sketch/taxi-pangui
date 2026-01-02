// src/screens/ChatRide.js
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Vibration,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRoute } from '@react-navigation/native';
import { auth } from '../lib/firebase';
import { subscribeRideMessages, sendRideMessage } from '../lib/chat';

// ✅ helper: uid compatible (senderUid o fromUid)
function getMsgUid(m) {
  return m?.senderUid || m?.fromUid || null;
}

// ✅ helper: timestamp comparable (createdAt puede venir como number/string/Firestore Timestamp)
function getMsgTs(m) {
  const t = m?.createdAt || m?.timestamp || m?.created_at || null;
  if (!t) return null;

  // Firestore Timestamp
  if (typeof t === 'object' && typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t === 'object' && typeof t.seconds === 'number') return t.seconds * 1000;

  // number
  if (typeof t === 'number') return t;

  // string date
  const d = Date.parse(String(t));
  return Number.isFinite(d) ? d : null;
}

async function vibrateIncoming() {
  try {
    // ✅ más confiable en Expo
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch (_) {
    // fallback
    Vibration.vibrate(120);
  }
}

export default function ChatRide() {
  const route = useRoute();
  const rideId = route.params?.rideId;

  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const flatRef = useRef(null);

  // ✅ refs para evitar vibrar en el primer render y detectar mensaje nuevo real
  const didInitRef = useRef(false);
  const prevKeyRef = useRef(null); // guarda "firma" del último mensaje (id+ts)

  // ⚠️ myUid en ref para no depender de renders
  const myUidRef = useRef(auth.currentUser?.uid || null);
  useEffect(() => {
    myUidRef.current = auth.currentUser?.uid || null;
  });

  useEffect(() => {
    if (!rideId) {
      setLoading(false);
      setMessages([]);
      return;
    }

    const unsub = subscribeRideMessages(rideId, async (msgs) => {
      const safe = Array.isArray(msgs) ? msgs : [];

      // ✅ detectar si llegó un nuevo mensaje
      if (safe.length) {
        const last = safe[safe.length - 1];
        const lastId = last?.id || null;
        const lastTs = getMsgTs(last);
        const lastKey = `${lastId || ''}::${lastTs || ''}`;

        if (!didInitRef.current) {
          // primer lote = historial → NO vibrar
          didInitRef.current = true;
          prevKeyRef.current = lastKey;
        } else {
          const isNew = lastKey && lastKey !== prevKeyRef.current;

          // ✅ si no es mío, vibrar
          const fromUid = getMsgUid(last);
          const myUid = myUidRef.current;
          const fromMe = !!myUid && !!fromUid && fromUid === myUid;

          if (isNew && !fromMe) {
            await vibrateIncoming();
          }

          prevKeyRef.current = lastKey;
        }
      }

      setMessages(safe);
      setLoading(false);
    });

    return () => unsub();
  }, [rideId]);

  useEffect(() => {
    if (!flatRef.current) return;
    if (!messages.length) return;

    const t = setTimeout(() => {
      try {
        flatRef.current.scrollToEnd({ animated: true });
      } catch (_) {}
    }, 80);

    return () => clearTimeout(t);
  }, [messages.length]);

  async function onSend() {
    if (sending) return;
    const msg = text.trim();
    if (!msg) return;

    setSending(true);
    try {
      await sendRideMessage(rideId, msg);
      setText('');
    } catch (e) {
      console.log(e);
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 8 }}>Cargando chat…</Text>
      </View>
    );
  }

  if (!rideId) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Text>No se recibió el ID de la carrera.</Text>
      </View>
    );
  }

  const extraBottom = Platform.OS === 'ios' ? 10 : 14;
  const behavior = Platform.OS === 'ios' ? 'padding' : 'height';
  const keyboardOffset = Platform.OS === 'ios' ? 90 : 80;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: 'white' }}
      behavior={behavior}
      keyboardVerticalOffset={keyboardOffset}
    >
      <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
        <Text style={{ fontWeight: '800' }}>Chat de carrera</Text>
        <Text style={{ color: '#666', fontSize: 12 }}>
          ID: {String(rideId).slice(0, 10)}…
        </Text>
      </View>

      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: 12,
          flexGrow: 1,
          justifyContent: messages.length ? 'flex-start' : 'center',
        }}
        renderItem={({ item }) => {
          const myUid = myUidRef.current;
          const fromUid = getMsgUid(item);
          const mine = !!myUid && !!fromUid && fromUid === myUid;

          return (
            <View
              style={{
                alignSelf: mine ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                marginBottom: 10,
                padding: 10,
                borderRadius: 12,
                backgroundColor: mine ? '#1877f2' : '#f2f2f2',
              }}
            >
              <Text style={{ fontSize: 12, opacity: mine ? 0.9 : 0.7, color: mine ? 'white' : '#333' }}>
                {item.senderName || item.fromName || '—'} {item.senderRole || item.fromRole ? `(${item.senderRole || item.fromRole})` : ''}
              </Text>

              <Text style={{ marginTop: 4, color: mine ? 'white' : '#111', fontWeight: '600' }}>
                {item.text}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={{ color: '#666', textAlign: 'center' }}>
            Aún no hay mensajes.
          </Text>
        }
      />

      <View
        style={{
          paddingHorizontal: 10,
          paddingTop: 10,
          paddingBottom: extraBottom,
          borderTopWidth: 1,
          borderTopColor: '#eee',
          backgroundColor: '#fff',
        }}
      >
        <View style={{ flexDirection: 'row' }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Escribe un mensaje…"
            multiline
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: '#ddd',
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginRight: 8,
              maxHeight: 110,
            }}
          />
          <TouchableOpacity
            onPress={onSend}
            disabled={sending || !text.trim()}
            style={{
              backgroundColor: sending || !text.trim() ? '#9bbcf7' : '#1877f2',
              paddingHorizontal: 16,
              borderRadius: 12,
              justifyContent: 'center',
              minHeight: 44,
            }}
          >
            <Text style={{ color: 'white', fontWeight: '800' }}>
              {sending ? '...' : 'Enviar'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
