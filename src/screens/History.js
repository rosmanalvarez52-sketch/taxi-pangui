import React, { useEffect, useState } from 'react';
import { View, FlatList, Text } from 'react-native';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

export default function History(){
  const [rides, setRides] = useState([]);

  useEffect(()=>{
    const q = query(
      collection(db,'rides'),
      where('passengerId','==',auth.currentUser.uid),
      orderBy('createdAt','desc')
    );
    const unsub = onSnapshot(q, snap=>{
      setRides(snap.docs.map(d=>({id:d.id, ...d.data()})));
    });
    return () => unsub();
  },[]);

  return (
    <View style={{flex:1, padding:12}}>
      <FlatList
        data={rides}
        keyExtractor={(i)=>i.id}
        renderItem={({item})=>(
          <View style={{padding:12, borderBottomWidth:1}}>
            <Text>Estado: {item.status}</Text>
            <Text>Oferta: ${item.offer}</Text>
          </View>
        )}
        ListEmptyComponent={<Text>Aún no hay viajes.</Text>}
      />
    </View>
  );
}
