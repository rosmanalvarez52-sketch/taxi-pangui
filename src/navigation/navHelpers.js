// src/navigation/navHelpers.js
import { CommonActions } from '@react-navigation/native';

export function resetTo(navigation, screenName) {
  navigation.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: screenName }],
    })
  );
}
