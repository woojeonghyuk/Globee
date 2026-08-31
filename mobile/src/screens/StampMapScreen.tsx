import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import ScreenShell from '@/src/components/ScreenShell';
import { useChildProfiles } from '@/src/state/ChildProfilesContext';
import { useCompletedRecords } from '@/src/state/CompletedRecordsContext';
import { colors } from '@/src/theme/colors';

export default function StampMapScreen() {
  const {
    completedRecords,
    getStampProgressItems,
    refreshCompletedRecords,
  } = useCompletedRecords();
  const { children } = useChildProfiles();
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const activeChildId =
    children.length > 0 ? selectedChildId ?? children[0].id : null;
  const visibleCompletedRecords = activeChildId
    ? completedRecords.filter((record) => record.childId === activeChildId)
    : completedRecords;
  const stampItems = getStampProgressItems(visibleCompletedRecords);
  const collectedCount = stampItems.filter((item) => item.collected).length;
  const orderedStampItems = [...stampItems].sort(
    (first, second) =>
      Number(second.collected) - Number(first.collected) ||
      second.completedCount - first.completedCount,
  );

  useEffect(() => {
    if (children.length === 0) {
      setSelectedChildId(null);
      return;
    }

    if (
      !selectedChildId ||
      !children.some((child) => child.id === selectedChildId)
    ) {
      setSelectedChildId(children[0].id);
    }
  }, [children, selectedChildId]);

  useFocusEffect(
    useCallback(() => {
      refreshCompletedRecords();
    }, [refreshCompletedRecords]),
  );

  return (
    <ScreenShell>
      <View style={styles.header}>
        <Text style={styles.title}>나라 스탬프</Text>
        <Text style={styles.subtitle}>
          문화교류를 완료한 나라의 스탬프를 모아봐요.
        </Text>
      </View>

      {children.length > 1 ? (
        <ScrollView
          horizontal
          style={styles.childSelectorScroll}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.childSelector}
        >
          {children.map((child) => {
            const isSelected = child.id === activeChildId;

            return (
              <Pressable
                key={child.id}
                onPress={() => setSelectedChildId(child.id)}
                style={[
                  styles.childChip,
                  isSelected && styles.childChipSelected,
                ]}
              >
                <Text
                  style={[
                    styles.childChipText,
                    isSelected && styles.childChipTextSelected,
                  ]}
                >
                  {child.fullName}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>{collectedCount}개 나라 경험 완료</Text>
      </View>

      <View style={styles.stampGrid}>
        {orderedStampItems.map((stamp, index) => {
          const isThirdItem = (index + 1) % 3 === 0;

          return (
            <View
              key={stamp.id}
              style={[
                styles.stampCard,
                !isThirdItem && styles.stampCardGap,
                stamp.collected
                  ? styles.collectedStampCard
                  : styles.lockedStampCard,
              ]}
            >
              <Text style={[styles.flag, !stamp.collected && styles.lockedFlag]}>
                {stamp.flag}
              </Text>

              <Text
                style={styles.country}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
              >
                {stamp.country}
              </Text>

              <Text
                style={[
                  styles.stampState,
                  stamp.collected && styles.collectedState,
                ]}
              >
                {stamp.collected ? `${stamp.completedCount}회 완료` : '미획득'}
              </Text>
            </View>
          );
        })}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 22,
  },
  title: {
    color: colors.navy,
    fontFamily: 'Pretendard-Bold',
    fontSize: 30,
    letterSpacing: 0,
    marginBottom: 8,
  },
  subtitle: {
    color: colors.muted,
    fontFamily: 'Pretendard-Medium',
    fontSize: 15,
    lineHeight: 23,
  },
  childSelector: {
    alignItems: 'center',
    gap: 8,
    paddingRight: 4,
  },
  childSelectorScroll: {
    flexGrow: 0,
    height: 48,
    marginBottom: 16,
  },
  childChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    borderRadius: 20,
    height: 44,
    justifyContent: 'center',
    minWidth: 92,
    paddingHorizontal: 18,
  },
  childChipSelected: {
    backgroundColor: colors.navy,
  },
  childChipText: {
    color: colors.navySoft,
    fontFamily: 'Pretendard-Bold',
    fontSize: 14,
  },
  childChipTextSelected: {
    color: colors.white,
  },
  summary: {
    marginBottom: 16,
  },
  summaryTitle: {
    color: colors.navy,
    fontFamily: 'Pretendard-Bold',
    fontSize: 24,
    letterSpacing: 0,
  },
  stampGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  stampCard: {
    width: '30.66%',
    minHeight: 132,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 12,
  },
  stampCardGap: {
    marginRight: '4.01%',
  },
  collectedStampCard: {
    backgroundColor: colors.white,
    borderColor: '#F0E7CB',
  },
  lockedStampCard: {
    backgroundColor: 'rgba(255,255,255,0.38)',
    borderColor: 'rgba(240,231,203,0.55)',
    opacity: 0.52,
  },
  flag: {
    fontSize: 30,
    marginBottom: 10,
  },
  lockedFlag: {
    opacity: 0.58,
  },
  country: {
    color: colors.navy,
    fontFamily: 'Pretendard-Bold',
    fontSize: 14,
    marginBottom: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
  stampState: {
    color: colors.muted,
    fontFamily: 'Pretendard-Bold',
    fontSize: 11,
    textAlign: 'center',
  },
  collectedState: {
    color: colors.green,
  },
});
