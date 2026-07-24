
import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './useAuth';
import { AppNotification } from '../types/notification';
import { playNewOrderSound, playNewMessageSound, ensureAudioContextRunning } from '../services/notificationSoundService';

export const useMerchantNotificationSounds = () => {
  const { currentUser, role, userProfile, updateUserProfile } = useAuth();
  const [soundPreferenceEnabled, setSoundPreferenceEnabled] = useState(
    userProfile?.preferences?.notificationSoundEnabled ?? false
  );
  const [soundSessionUnlocked, setSoundSessionUnlocked] = useState(false);
  const playedNotificationIds = useRef(new Set<string>());
  const channel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (role === 'merchant') {
      channel.current = new BroadcastChannel('uaipertim-merchant-notification-sounds');
      channel.current.onmessage = (event) => {
        playedNotificationIds.current.add(event.data);
      };
    }
    return () => {
      channel.current?.close();
    };
  }, [role]);

  const setSoundPreference = useCallback(async (enabled: boolean) => {
    if (!currentUser) return;
    setSoundPreferenceEnabled(enabled);
    await updateUserProfile({
      preferences: {
        ...userProfile?.preferences,
        notificationSoundEnabled: enabled,
        orderUpdates: userProfile?.preferences?.orderUpdates ?? true,
        marketing: userProfile?.preferences?.marketing ?? false,
        confirmCartClear: userProfile?.preferences?.confirmCartClear ?? true,
      } as any
    });
  }, [currentUser, updateUserProfile, userProfile]);

  const enableMerchantSounds = useCallback(async () => {
    try {
      const state = await ensureAudioContextRunning();
      if (state === 'running') {
        setSoundSessionUnlocked(true);
        await playNewMessageSound(); // Sound test
      }
    } catch (e) {
      console.error("MERCHANT_SOUND_UNLOCK_ERROR", e);
    }
  }, []);

  const playSound = useCallback(async (notification: AppNotification) => {
    console.log("MERCHANT_SOUND_DIAGNOSTIC", {
      soundPreferenceEnabled,
      soundSessionUnlocked,
      notificationId: notification.id,
      notificationType: notification.type,
      recipientRole: notification.recipientRole,
    });
    
    if (role !== 'merchant' || !soundPreferenceEnabled || !soundSessionUnlocked) return;
    if (playedNotificationIds.current.has(notification.id)) return;

    // Broadcast to other tabs
    channel.current?.postMessage(notification.id);
    playedNotificationIds.current.add(notification.id);

    if (notification.type === 'new_order') {
      await playNewOrderSound();
    } else if (notification.type === 'new_message') {
      await playNewMessageSound();
    }
  }, [role, soundPreferenceEnabled, soundSessionUnlocked]);

  return {
    soundPreferenceEnabled,
    soundSessionUnlocked,
    setSoundPreference: setSoundPreference,
    setSoundSessionUnlocked,
    enableMerchantSounds,
    playSound
  };
};
