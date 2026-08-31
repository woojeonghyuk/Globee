import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import ClassCard from '@/src/components/ClassCard';
import ClassDetailSheet from '@/src/components/ClassDetailSheet';
import ScreenShell from '@/src/components/ScreenShell';
import SectionHeader from '@/src/components/SectionHeader';
import { ApplicationItem, ClassItem } from '@/src/data/classes';
import { useApplications } from '@/src/state/ApplicationsContext';
import { useClasses } from '@/src/state/ClassesContext';
import { colors } from '@/src/theme/colors';

function isActiveApplicationStatus(status: string) {
  return status === '신청 확인중' || status === '신청 완료' || status === '확정 대기';
}

function isPendingReviewStatus(status: string) {
  return status === '신청 확인중';
}

function isConfirmedApplicationStatus(status: string) {
  return status === '신청 완료' || status === '확정 대기';
}

function getApplicationBadge(application: ApplicationItem) {
  const childName = application.childName || '아이';

  if (application.status === '신청 확인중') return `${childName} 확인중`;
  if (application.status === '확정 대기') return `${childName} 대기중`;

  return `${childName} 신청완료`;
}

function getClassSortTime(classItem: ClassItem | undefined) {
  if (!classItem) return Number.MAX_SAFE_INTEGER;

  const date = new Date(classItem.startsAt);

  return Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime();
}

export default function ApplicationsScreen() {
  const { applications, cancelApplication, refreshApplications } =
    useApplications();
  const { getClassById } = useClasses();
  const [selectedApplication, setSelectedApplication] =
    useState<ApplicationItem | null>(null);
  const sortedActiveApplications = useMemo(
    () =>
      applications
        .filter((application) => isActiveApplicationStatus(application.status))
        .sort(
          (first, second) =>
            getClassSortTime(getClassById(first.classId)) -
            getClassSortTime(getClassById(second.classId)),
        ),
    [applications, getClassById],
  );
  const pendingApplications = useMemo(
    () =>
      sortedActiveApplications.filter((application) =>
        isPendingReviewStatus(application.status),
      ),
    [sortedActiveApplications],
  );
  const confirmedApplications = useMemo(
    () =>
      sortedActiveApplications.filter((application) =>
        isConfirmedApplicationStatus(application.status),
      ),
    [sortedActiveApplications],
  );

  const selectedClass = selectedApplication
    ? getClassById(selectedApplication.classId) ?? null
    : null;

  useFocusEffect(
    useCallback(() => {
      refreshApplications();
    }, [refreshApplications]),
  );

  const openApplicationDetail = (application: ApplicationItem) => {
    setSelectedApplication(application);
  };

  const closeApplicationDetail = () => {
    setSelectedApplication(null);
  };

  const getOwnActiveApplicationCount = useCallback(
    (classId: string) =>
      applications.filter(
        (application) =>
          application.classId === classId &&
          isActiveApplicationStatus(application.status),
      ).length,
    [applications],
  );

  const getReservedCount = useCallback(
    (classItem: ClassItem) =>
      Math.max(classItem.seatsTaken, getOwnActiveApplicationCount(classItem.id)),
    [getOwnActiveApplicationCount],
  );

  const getSeatsLabel = useCallback(
    (classId: string) => {
      const classItem = getClassById(classId);
      if (!classItem) return undefined;

      const remaining = Math.max(
        classItem.seatsTotal - getReservedCount(classItem),
        0,
      );

      return remaining > 0 ? `${remaining}자리 남음` : '마감';
    },
    [getClassById, getReservedCount],
  );

  const isClassFull = useCallback(
    (classId: string) => {
      const classItem = getClassById(classId);
      if (!classItem) return false;

      return classItem.seatsTotal - getReservedCount(classItem) <= 0;
    },
    [getClassById, getReservedCount],
  );

  const getCapacityText = useCallback(
    (classId: string) => {
      const classItem = getClassById(classId);
      if (!classItem) return undefined;

      return `${Math.min(
        getReservedCount(classItem),
        classItem.seatsTotal,
      )}/${classItem.seatsTotal}명`;
    },
    [getClassById, getReservedCount],
  );

  const handleCancelApplication = () => {
    if (!selectedApplication || !selectedClass) return;

    Alert.alert(
      '신청을 취소할까요?',
      `${selectedApplication.childName} 아이의 ${selectedClass.country} 문화교류 신청이 취소돼요.`,
      [
        { text: '아니요', style: 'cancel' },
        {
          text: '신청 취소',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelApplication(selectedApplication.id);
              closeApplicationDetail();
            } catch {
              Alert.alert(
                '취소 실패',
                '신청을 취소하지 못했어요. 잠시 후 다시 시도해주세요.',
              );
            }
          },
        },
      ],
    );
  };

  return (
    <ScreenShell>
      <View style={styles.header}>
        <Text style={styles.title}>신청내역</Text>
      </View>

      {pendingApplications.length > 0 ? (
        <>
          <SectionHeader
            title="확인 중인 신청"
            subtitle="운영진이 신청 내용을 확인하고 있어요."
          />

          <View style={[styles.list, styles.pendingList]}>
            {pendingApplications.map((application) => {
              const classItem = getClassById(application.classId);
              if (!classItem) return null;

              return (
                <ClassCard
                  key={application.id}
                  item={classItem}
                  badges={[getApplicationBadge(application)]}
                  seatsFull={isClassFull(application.classId)}
                  seatsLabel={getSeatsLabel(application.classId)}
                  onPress={() => openApplicationDetail(application)}
                />
              );
            })}
          </View>
        </>
      ) : null}

      {confirmedApplications.length > 0 || pendingApplications.length === 0 ? (
        <>
          <SectionHeader
            title="신청 완료"
            subtitle="참여가 확정된 문화교류예요."
          />

          <View style={styles.list}>
            {confirmedApplications.map((application) => {
              const classItem = getClassById(application.classId);
              if (!classItem) return null;

              return (
                <ClassCard
                  key={application.id}
                  item={classItem}
                  badges={[getApplicationBadge(application)]}
                  seatsFull={isClassFull(application.classId)}
                  seatsLabel={getSeatsLabel(application.classId)}
                  onPress={() => openApplicationDetail(application)}
                />
              );
            })}
          </View>
        </>
      ) : null}

      {sortedActiveApplications.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>아직 신청한 문화가 없어요</Text>
          <Text style={styles.emptyText}>홈에서 아이에게 맞는 문화를 찾아보세요.</Text>
        </View>
      ) : null}

      <ClassDetailSheet
        visible={selectedApplication !== null}
        classItem={selectedClass}
        capacityText={
          selectedApplication
            ? getCapacityText(selectedApplication.classId)
            : undefined
        }
        onClose={closeApplicationDetail}
        action={
          <Pressable
            style={({ pressed }) => [
              styles.cancelButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={handleCancelApplication}
          >
            <Text style={styles.cancelButtonText}>신청 취소하기</Text>
          </Pressable>
        }
      >
        {selectedApplication ? (
          <View style={styles.appliedChildSection}>
            <Text style={styles.appliedChildTitle}>신청한 아이</Text>
            <View style={styles.appliedChildBox}>
              <Text style={styles.appliedChildName}>
                {selectedApplication.childName}
              </Text>
            </View>
          </View>
        ) : null}
      </ClassDetailSheet>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 22,
  },
  title: {
    color: colors.navy,
    fontSize: 30,
    fontFamily: 'Pretendard-Bold',
    letterSpacing: 0,
  },
  list: {
    gap: 14,
  },
  pendingList: {
    marginBottom: 26,
  },
  appliedChildSection: {
    marginBottom: 18,
  },
  appliedChildTitle: {
    color: colors.navy,
    fontSize: 15,
    fontFamily: 'Pretendard-Bold',
    marginBottom: 10,
  },
  appliedChildBox: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  appliedChildName: {
    color: colors.navy,
    fontSize: 13,
    fontFamily: 'Pretendard-Bold',
  },
  cancelButton: {
    height: 58,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5484D',
  },
  cancelButtonText: {
    color: colors.white,
    fontSize: 16,
    fontFamily: 'Pretendard-Bold',
  },
  buttonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  emptyCard: {
    padding: 24,
    borderRadius: 20,
    backgroundColor: colors.white,
    alignItems: 'center',
    marginTop: 20,
  },
  emptyTitle: {
    color: colors.navy,
    fontSize: 19,
    fontFamily: 'Pretendard-Bold',
    marginBottom: 8,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    fontFamily: 'Pretendard-Medium',
    textAlign: 'center',
  },
});
