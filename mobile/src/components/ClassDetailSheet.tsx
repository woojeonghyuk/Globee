import { ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClassItem } from '@/src/data/classes';
import { colors } from '@/src/theme/colors';

type ClassDetailSheetProps = {
  visible: boolean;
  classItem: ClassItem | null;
  capacityText?: string;
  onClose: () => void;
  children: ReactNode;
  action: ReactNode;
};

export default function ClassDetailSheet({
  visible,
  classItem,
  capacityText,
  onClose,
  children,
  action,
}: ClassDetailSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        {classItem ? (
          <View
            style={[
              styles.modalCard,
              { paddingBottom: Math.max(insets.bottom + 24, 28) },
            ]}
          >
            <View style={styles.modalTopRow}>
              <View
                style={[
                  styles.modalFlagBox,
                  { backgroundColor: classItem.imageColor },
                ]}
              >
                <Text style={styles.modalFlag}>{classItem.flag}</Text>
              </View>

              <Pressable
                onPress={onClose}
                style={styles.modalCloseButton}
                hitSlop={10}
              >
                <Text style={styles.modalCloseText}>×</Text>
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
            >
              <Text style={styles.teacherName}>선생님 {classItem.teacherName}</Text>
              <Text style={styles.countryName}>{classItem.country}</Text>
              <Text style={styles.modalTitle}>{classItem.title}</Text>
              <Text style={styles.modalDescription}>{classItem.description}</Text>

              <View style={styles.infoBox}>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>일시</Text>
                  <Text style={styles.infoText}>{classItem.schedule}</Text>
                </View>
                <View style={[styles.infoItem, styles.capacityItem]}>
                  <Text style={styles.infoLabel}>정원</Text>
                  <Text style={[styles.infoText, styles.capacityText]}>
                    {capacityText ?? `${classItem.seatsLeft}자리 남음`}
                  </Text>
                </View>
              </View>

              {children}
            </ScrollView>

            {action}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 46, 75, 0.32)',
  },
  modalCard: {
    maxHeight: '92%',
    padding: 22,
    paddingBottom: 28,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    backgroundColor: '#FFFDF7',
  },
  modalTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalFlagBox: {
    width: 86,
    height: 86,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalFlag: {
    fontSize: 42,
  },
  modalCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4EFD8',
  },
  modalCloseText: {
    color: colors.navy,
    fontSize: 28,
    fontFamily: 'Pretendard-Medium',
    lineHeight: 30,
  },
  modalScrollContent: {
    paddingBottom: 2,
  },
  teacherName: {
    color: colors.orange,
    fontSize: 18,
    fontFamily: 'Pretendard-Bold',
    marginBottom: 4,
  },
  countryName: {
    color: colors.navy,
    fontSize: 34,
    fontFamily: 'Pretendard-Bold',
    letterSpacing: 0,
    marginBottom: 10,
  },
  modalTitle: {
    color: colors.navy,
    fontSize: 21,
    lineHeight: 27,
    fontFamily: 'Pretendard-Bold',
    marginBottom: 10,
  },
  modalDescription: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'Pretendard-Medium',
    opacity: 0.78,
    marginBottom: 16,
  },
  infoBox: {
    flexDirection: 'row',
    gap: 10,
    padding: 15,
    borderRadius: 20,
    backgroundColor: '#F6F1DD',
    marginBottom: 18,
  },
  infoItem: {
    flex: 1.35,
    minWidth: 0,
  },
  capacityItem: {
    flex: 0.75,
    alignItems: 'flex-end',
  },
  infoLabel: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: 'Pretendard-Bold',
    marginBottom: 5,
  },
  infoText: {
    color: colors.navy,
    fontSize: 17,
    fontFamily: 'Pretendard-Bold',
    textAlign: 'left',
  },
  capacityText: {
    textAlign: 'right',
  },
});
