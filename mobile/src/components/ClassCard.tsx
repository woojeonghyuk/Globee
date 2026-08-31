import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ClassItem } from '@/src/data/classes';
import { colors } from '@/src/theme/colors';

type ClassCardProps = {
  item: ClassItem;
  badges?: string[];
  compact?: boolean;
  onPress?: () => void;
  seatsFull?: boolean;
  seatsLabel?: string;
};

function getStatusBadgeStyle(badge: string) {
  if (badge.includes('확인중') || badge.includes('대기중')) {
    return {
      badge: styles.pendingStatusBadge,
      text: styles.pendingStatusBadgeText,
    };
  }

  return {
    badge: styles.confirmedStatusBadge,
    text: styles.confirmedStatusBadgeText,
  };
}

export default function ClassCard({
  item,
  badges = [],
  compact = false,
  onPress,
  seatsFull = false,
  seatsLabel,
}: ClassCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        compact && styles.compactCard,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <View style={[styles.visual, { backgroundColor: item.imageColor }]}>
        <Text style={styles.flag}>{item.flag}</Text>
        <Text
          style={styles.visualText}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
        >
          {item.country}
        </Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.meta}>
          {item.country} · 선생님 {item.teacherName}
        </Text>
        <View style={styles.scheduleRow}>
          <Text style={styles.schedule}>{item.schedule}</Text>
          {seatsLabel ? (
            <View
              style={[
                styles.seatsBadge,
                seatsFull && styles.fullSeatsBadge,
              ]}
            >
              <Text
                style={[
                  styles.seatsBadgeText,
                  seatsFull && styles.fullSeatsBadgeText,
                ]}
              >
                {seatsLabel}
              </Text>
            </View>
          ) : null}
        </View>
        {badges.length > 0 ? (
          <View style={styles.badgeRow}>
            {badges.map((badge) => {
              const badgeStyle = getStatusBadgeStyle(badge);

              return (
                <View key={badge} style={[styles.statusBadge, badgeStyle.badge]}>
                  <Text style={[styles.statusBadgeText, badgeStyle.text]}>
                    {badge}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 14,
    padding: 14,
    borderRadius: 20,
    backgroundColor: colors.cardSolid,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.88)',
    shadowColor: colors.navy,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
    elevation: 5,
  },
  compactCard: {
    shadowOpacity: 0.05,
    elevation: 3,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  visual: {
    width: 94,
    minHeight: 112,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  flag: {
    fontSize: 34,
  },
  visualText: {
    color: colors.navy,
    fontSize: 13,
    fontFamily: 'Pretendard-Bold',
    lineHeight: 17,
    textAlign: 'center',
  },
  body: {
    flex: 1,
    minHeight: 112,
    justifyContent: 'center',
  },
  title: {
    color: colors.navy,
    fontSize: 18,
    lineHeight: 23,
    fontFamily: 'Pretendard-Bold',
    letterSpacing: 0,
    marginBottom: 10,
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'Pretendard-Medium',
  },
  scheduleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    marginTop: 8,
  },
  schedule: {
    color: colors.navy,
    flexShrink: 1,
    fontSize: 14,
    fontFamily: 'Pretendard-Bold',
  },
  seatsBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF1C7',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  fullSeatsBadge: {
    backgroundColor: '#EEF1F4',
  },
  seatsBadgeText: {
    color: '#9A6B00',
    fontSize: 11,
    fontFamily: 'Pretendard-Bold',
  },
  fullSeatsBadgeText: {
    color: colors.muted,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  pendingStatusBadge: {
    backgroundColor: '#FFF1C7',
  },
  confirmedStatusBadge: {
    backgroundColor: colors.mint,
  },
  statusBadgeText: {
    fontSize: 11,
    fontFamily: 'Pretendard-Bold',
  },
  pendingStatusBadgeText: {
    color: '#9A6B00',
  },
  confirmedStatusBadgeText: {
    color: colors.green,
  },
});
