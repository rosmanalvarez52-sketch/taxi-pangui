// src/app/index.tsx
import React from "react";
import { View } from "react-native";

// La navegación la decide _layout.js (auth + role).
// Este archivo solo evita render innecesario.
export default function Page() {
  return <View style={{ flex: 1 }} />;
}
