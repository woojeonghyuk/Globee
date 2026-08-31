import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import BrandWordmark from '@/src/components/BrandWordmark';
import ClassCard from '@/src/components/ClassCard';
import ClassDetailSheet from '@/src/components/ClassDetailSheet';
import ScreenShell from '@/src/components/ScreenShell';
import { ClassItem, fixedCampusOptions } from '@/src/data/classes';
import {
  clearChildRegistrationGuidePending,
  isChildRegistrationGuidePending,
} from '@/src/lib/childRegistrationGuide';
import { getApplicationErrorMessage } from '@/src/lib/authMessages';
import { supabase } from '@/src/lib/supabase';
import { useApplications } from '@/src/state/ApplicationsContext';
import { useClasses } from '@/src/state/ClassesContext';
import { useChildProfiles } from '@/src/state/ChildProfilesContext';
import { authColors } from '@/src/theme/auth';
import { colors } from '@/src/theme/colors';

function getCampusLabel(campus: string) {
  const campusLabels: Record<string, string> = {
    서울과학기술대학교: '서울과기대',
    광운대학교: '광운대',
    서울여자대학교: '서울여대',
    삼육대학교: '삼육대',
  };

  return campusLabels[campus] ?? campus;
}

function isActiveApplicationStatus(status: string) {
  return status === '신청 확인중' || status === '신청 완료' || status === '확정 대기';
}

function getApplicationBadgeLabel(childName: string, status: string) {
  if (status === '신청 확인중') return `${childName} 확인중`;
  if (status === '확정 대기') return `${childName} 대기중`;

  return `${childName} 신청완료`;
}

function getClassSortTime(classItem: ClassItem) {
  const date = new Date(classItem.startsAt);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export default function HomeScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const { guestIntro } = useLocalSearchParams<{ guestIntro?: string }>();
  const { children, isLoading: isLoadingChildren } = useChildProfiles();
  const { classes, errorMessage, isLoading, refreshClasses } = useClasses();
  const {
    addApplication,
    applications,
    hasActiveApplication,
    refreshApplications,
  } = useApplications();
  const [selectedCampus, setSelectedCampus] = useState('');
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([]);
  const [isApplying, setIsApplying] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [showGuestBrowsingGuide, setShowGuestBrowsingGuide] = useState(false);
  const [showChildRegistrationGuide, setShowChildRegistrationGuide] =
    useState(false);

  const hiddenCompletedClassIds = useMemo(
    () =>
      new Set(
        applications
          .filter(
            (application) =>
              application.status === '완료문화' ||
              application.status === '미참여',
          )
          .map((application) => application.classId),
      ),
    [applications],
  );

  const visibleClasses = useMemo(
    () => classes.filter((item) => !hiddenCompletedClassIds.has(item.id)),
    [classes, hiddenCompletedClassIds],
  );

  const campusOptions = fixedCampusOptions;
  const campusRowWidth = Math.max(screenWidth - 44, 0);
  const isCompactCampusRow = campusRowWidth < 300;
  const campusChipHorizontalPadding = isCompactCampusRow ? 7 : 11;
  const campusChipGap = isCompactCampusRow ? 8 : 12;
  const campusLabelCharacterCount = campusOptions.reduce(
    (total, campus) => total + getCampusLabel(campus).length,
    0,
  );
  const campusTextWidth =
    campusRowWidth -
    campusChipHorizontalPadding * campusOptions.length * 2 -
    campusChipGap * (campusOptions.length - 1);
  const campusFontSize = Math.min(
    15,
    Math.max(
      11,
      Math.floor((campusTextWidth / campusLabelCharacterCount) * 2) / 2,
    ),
  );

  useEffect(() => {
    if (!campusOptions.includes(selectedCampus)) {
      setSelectedCampus(campusOptions[0]);
    }
  }, [campusOptions, selectedCampus]);

  useEffect(() => {
    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (isMounted) {
          setHasSession(Boolean(data.session));
        }
      })
      .catch(() => {
        if (isMounted) {
          setHasSession(false);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setHasSession(Boolean(session));
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (hasSession === false && guestIntro === '1') {
      setShowGuestBrowsingGuide(true);
    }

    if (hasSession === true) {
      setShowGuestBrowsingGuide(false);
    }
  }, [guestIntro, hasSession]);

  const filteredClasses = useMemo(
    () =>
      (selectedCampus
        ? visibleClasses.filter((item) => item.campus === selectedCampus)
        : visibleClasses
      ).sort((first, second) => getClassSortTime(first) - getClassSortTime(second)),
    [selectedCampus, visibleClasses],
  );

  useEffect(() => {
    let isMounted = true;

    async function syncChildRegistrationGuide() {
      if (isLoading || isLoadingChildren) {
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted || !user) {
        return;
      }

      if (children.length > 0 || visibleClasses.length > 0) {
        await clearChildRegistrationGuidePending(user.id);

        if (isMounted) {
          setShowChildRegistrationGuide(false);
        }
        return;
      }

      if (errorMessage) {
        if (isMounted) {
          setShowChildRegistrationGuide(false);
        }
        return;
      }

      const shouldShowGuide = await isChildRegistrationGuidePending(user.id);

      if (isMounted) {
        setShowChildRegistrationGuide(shouldShowGuide);
      }
    }

    void syncChildRegistrationGuide();

    return () => {
      isMounted = false;
    };
  }, [
    children.length,
    errorMessage,
    isLoading,
    isLoadingChildren,
    visibleClasses.length,
  ]);

  useFocusEffect(
    useCallback(() => {
      refreshClasses();
      refreshApplications();
    }, [refreshApplications, refreshClasses]),
  );

  const selectedChildren = children.filter((child) =>
    selectedChildIds.includes(child.id),
  );

  const getActiveApplicationsForClass = useCallback(
    (classId: string) =>
      applications
        .filter(
          (application) =>
            application.classId === classId &&
            isActiveApplicationStatus(application.status),
        ),
    [applications],
  );

  const getChildActiveApplication = useCallback(
    (classId: string, childId: string) =>
      applications.find(
        (application) =>
          application.classId === classId &&
          application.childId === childId &&
          isActiveApplicationStatus(application.status),
      ),
    [applications],
  );

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

  const getSeatsRemaining = useCallback(
    (classItem: ClassItem) =>
      Math.max(classItem.seatsTotal - getReservedCount(classItem), 0),
    [getReservedCount],
  );

  const getSeatsLabel = useCallback(
    (classItem: ClassItem) => {
      const remaining = getSeatsRemaining(classItem);

      return remaining > 0 ? `${remaining}자리 남음` : '마감';
    },
    [getSeatsRemaining],
  );

  const getCapacityText = useCallback(
    (classItem: ClassItem) =>
      `${Math.min(getReservedCount(classItem), classItem.seatsTotal)}/${
        classItem.seatsTotal
      }명`,
    [getReservedCount],
  );

  const getAppliedBadges = useCallback(
    (classId: string) => {
      const badges = getActiveApplicationsForClass(classId)
        .filter((application) => application.childName)
        .map((application) =>
          getApplicationBadgeLabel(application.childName, application.status),
        );
      const uniqueBadges = Array.from(new Set(badges));

      if (uniqueBadges.length <= 2) {
        return uniqueBadges;
      }

      return [
        `${uniqueBadges[0]}, ${uniqueBadges[1]} 외 ${uniqueBadges.length - 2}명 신청중`,
      ];
    },
    [getActiveApplicationsForClass],
  );

  const openClassDetail = (classItem: ClassItem) => {
    const firstAvailableChild = children.find(
      (child) => !hasActiveApplication(classItem.id, child.id),
    );

    setSelectedClass(classItem);
    setSelectedChildIds(firstAvailableChild ? [firstAvailableChild.id] : []);
  };

  const closeClassDetail = () => {
    setSelectedClass(null);
    setSelectedChildIds([]);
  };

  const toggleChild = (childId: string) => {
    if (selectedClass && hasActiveApplication(selectedClass.id, childId)) return;

    setSelectedChildIds((prev) =>
      prev.includes(childId)
        ? prev.filter((id) => id !== childId)
        : [...prev, childId],
    );
  };

  const goToMyPage = () => {
    closeClassDetail();
    router.push('/(tabs)/my');
  };

  const goToLogin = () => {
    closeClassDetail();
    router.push('/login');
  };

  const goToSignup = () => {
    closeClassDetail();
    router.push('/signup');
  };

  const returnToStart = () => {
    closeClassDetail();
    setShowGuestBrowsingGuide(false);
    router.replace('/');
  };

  const dismissGuestBrowsingGuide = () => {
    setShowGuestBrowsingGuide(false);
    router.setParams({ guestIntro: undefined });
  };

  const dismissChildRegistrationGuide = useCallback(async () => {
    setShowChildRegistrationGuide(false);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await clearChildRegistrationGuidePending(user.id);
    }
  }, []);

  const openChildRegistration = useCallback(async () => {
    await dismissChildRegistrationGuide();
    router.push({
      pathname: '/(tabs)/my',
      params: { openAddChild: '1' },
    });
  }, [dismissChildRegistrationGuide]);

  const handleApply = async () => {
    if (!selectedClass || isApplying) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      goToLogin();
      return;
    }

    const remainingSeats = getSeatsRemaining(selectedClass);

    if (remainingSeats === 0) {
      Alert.alert('마감된 문화교류예요', '이 문화교류는 신청 가능한 자리가 없어요.');
      return;
    }

    if (selectedChildren.length === 0) {
      if (children.length > 0) {
        const allChildrenAlreadyApplied = children.every((child) =>
          hasActiveApplication(selectedClass.id, child.id),
        );

        if (allChildrenAlreadyApplied) {
          Alert.alert(
            '이미 신청한 문화교류예요',
            '등록된 아이가 모두 이 문화교류를 신청했어요.',
          );
          return;
        }

        Alert.alert('아이 선택 필요', '신청할 아이를 선택해주세요.');
        return;
      }

      Alert.alert('아이 등록 필요', '마이페이지에서 아이를 먼저 등록해주세요.');
      return;
    }

    if (selectedChildren.length > remainingSeats) {
      Alert.alert(
        '자리가 부족해요',
        `이 문화교류는 ${remainingSeats}자리만 남아 있어요.`,
      );
      return;
    }

    const alreadyAppliedChildren = selectedChildren.filter((child) =>
      hasActiveApplication(selectedClass.id, child.id),
    );

    if (alreadyAppliedChildren.length > 0) {
      Alert.alert(
        '이미 신청한 문화교류예요',
        `${alreadyAppliedChildren
          .map((child) => child.fullName)
          .join(', ')} 아이는 이미 이 문화교류를 신청했어요.`,
      );
      return;
    }

    const childNames = selectedChildren.map((child) => child.fullName).join(', ');
    const applyMessage =
      selectedChildren.length > 1
        ? `${childNames} 아이들의 ${selectedClass.country} 문화교류를 신청할까요?\n신청 후 운영진 확인을 거쳐 신청 완료로 바뀌어요.`
        : `${childNames} 아이의 ${selectedClass.country} 문화교류를 신청할까요?\n신청 후 운영진 확인을 거쳐 신청 완료로 바뀌어요.`;

    Alert.alert('문화교류 신청', applyMessage, [
      { text: '취소', style: 'cancel' },
      {
        text: '신청하기',
        onPress: () => {
          void submitApplications();
        },
      },
    ]);
  };

  const submitApplications = async () => {
    if (!selectedClass || isApplying) return;

    const appliedNames: string[] = [];
    const skippedNames: string[] = [];

    try {
      setIsApplying(true);

      for (const child of selectedChildren) {
        const applied = await addApplication({
          classId: selectedClass.id,
          childId: child.id,
          childName: child.fullName,
          status: '신청 확인중',
        });

        if (applied) {
          appliedNames.push(child.fullName);
        } else {
          skippedNames.push(child.fullName);
        }
      }
    } catch (error) {
      refreshApplications();
      refreshClasses();

      const message =
        error instanceof Error
          ? getApplicationErrorMessage(error.message)
          : getApplicationErrorMessage();
      const partialMessage =
        appliedNames.length > 0
          ? `${appliedNames.join(', ')} 아이는 신청됐고, 나머지 신청 중 문제가 생겼어요.\n${message}`
          : message;

      Alert.alert(
        appliedNames.length > 0 ? '일부 신청 확인중' : '신청 실패',
        partialMessage,
      );
      return;
    } finally {
      setIsApplying(false);
    }

    refreshApplications();
    refreshClasses();

    if (appliedNames.length === 0) {
      Alert.alert('이미 신청한 문화교류예요', '선택한 아이가 이미 이 문화교류를 신청했어요.');
      return;
    }

    Alert.alert(
      '신청 확인중',
      `${appliedNames.join(', ')} 아이의 ${selectedClass.country} 문화교류 신청을 보냈어요.\n운영진 확인 후 신청 완료로 바뀌어요.${
        skippedNames.length > 0
          ? `\n이미 신청된 아이: ${skippedNames.join(', ')}`
          : ''
      }`,
      [{ text: '확인', onPress: closeClassDetail }],
    );
  };

  const selectedClassSeatsFull = selectedClass
    ? getSeatsRemaining(selectedClass) === 0
    : false;
  const isApplyButtonDisabled =
    isApplying || selectedClassSeatsFull || hasSession === null;

  return (
    <ScreenShell>
      <Modal
        visible={showGuestBrowsingGuide}
        transparent
        animationType="fade"
        onRequestClose={dismissGuestBrowsingGuide}
      >
        <View style={styles.guestGuideOverlay}>
          <View style={styles.guestGuideCard}>
            <Text style={styles.guestGuideTitle}>
              학교별 수업, 일정과 잔여 자리를 자유롭게 확인하세요.
            </Text>
            <Text style={styles.guestGuideText}>
              아이 등록 및 클래스 신청은 로그인 후 이용할 수 있어요.
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.guestGuideButton,
                pressed && styles.pressed,
              ]}
              onPress={dismissGuestBrowsingGuide}
            >
              <Text style={styles.guestGuideButtonText}>확인</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showChildRegistrationGuide}
        transparent
        animationType="fade"
        onRequestClose={() => {
          void dismissChildRegistrationGuide();
        }}
      >
        <View style={styles.guideOverlay}>
          <View style={styles.guideCard}>
            <View style={styles.guideBadge}>
              <Text style={styles.guideBadgeText}>처음 시작하기</Text>
            </View>

            <Text style={styles.guideTitle}>
              문화교류 신청 전에 아이 정보를 먼저 등록해 주세요
            </Text>
            <Text style={styles.guideText}>
              아이를 등록해 두면 수업이 열렸을 때 바로 신청할 수 있어요.
              {'\n'}마이페이지에서 아이 이름, 나이, 학교, 관심사를 먼저
              적어볼까요?
            </Text>

            <View style={styles.guideList}>
              <View style={styles.guideListRow}>
                <View style={styles.guideDot} />
                <Text style={styles.guideListText}>
                  아이 정보는 나중에도 수정할 수 있어요.
                </Text>
              </View>
              <View style={styles.guideListRow}>
                <View style={styles.guideDot} />
                <Text style={styles.guideListText}>
                  수업이 열리면 홈에서 바로 신청할 수 있어요.
                </Text>
              </View>
            </View>

            <View style={styles.guideActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.guideSecondaryButton,
                  pressed && styles.pressed,
                ]}
                onPress={() => {
                  void dismissChildRegistrationGuide();
                }}
              >
                <Text style={styles.guideSecondaryButtonText}>나중에 할게요</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.guidePrimaryButton,
                  pressed && styles.pressed,
                ]}
                onPress={() => {
                  void openChildRegistration();
                }}
              >
                <Text style={styles.guidePrimaryButtonText}>
                  아이 등록하러 가기
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.header}>
        <View style={styles.brandRow}>
          <BrandWordmark width={150} />
          {hasSession === false ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="시작화면으로 돌아가기"
              hitSlop={10}
              onPress={returnToStart}
              style={({ pressed }) => [
                styles.guestBackButton,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="arrow-back" size={28} color={authColors.navy} />
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.title}>동네에서 떠나는 세계여행{'\n'}오늘 가볼 나라는 어디일까요?</Text>
      </View>

      <View style={styles.schoolSection}>
        <Text style={styles.sectionLabel}>학교 선택하기</Text>
        <View style={[styles.schoolRow, { gap: campusChipGap }]}>
          {campusOptions.map((campus) => {
            const isActive = campus === selectedCampus;

            return (
              <Pressable
                key={campus}
                style={[
                  styles.schoolChip,
                  { paddingHorizontal: campusChipHorizontalPadding },
                  isActive && styles.activeSchoolChip,
                ]}
                onPress={() => setSelectedCampus(campus)}
              >
                <Text
                  style={[
                    styles.schoolChipText,
                    { fontSize: campusFontSize },
                    isActive && styles.activeSchoolChipText,
                  ]}
                  allowFontScaling={false}
                  numberOfLines={1}
                >
                  {getCampusLabel(campus)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.classSection}>
        <View style={styles.classHeader}>
          <Text style={styles.classHeaderTitle}>오늘의 여행가능한 곳</Text>
          <Text style={styles.classHeaderCount}>{filteredClasses.length}개</Text>
        </View>

        {errorMessage ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>목록을 불러오지 못했어요</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={styles.cardList}>
          {filteredClasses.map((item) => (
            <ClassCard
              key={item.id}
              item={item}
              badges={getAppliedBadges(item.id)}
              seatsFull={getSeatsRemaining(item) === 0}
              seatsLabel={getSeatsLabel(item)}
              onPress={() => openClassDetail(item)}
            />
          ))}
        </View>

        {filteredClasses.length === 0 ? (
          <View style={styles.emptyClassCard}>
            <Text style={styles.emptyClassTitle}>여행지를 준비 중이에요</Text>
            <Text style={styles.emptyClassText}>
              여행지가 완성되면 바로 보여드릴게요.
            </Text>
          </View>
        ) : null}
      </View>

      <ClassDetailSheet
        visible={selectedClass !== null}
        classItem={selectedClass}
        capacityText={selectedClass ? getCapacityText(selectedClass) : undefined}
        onClose={closeClassDetail}
        action={
          hasSession === false && !selectedClassSeatsFull ? (
            <View style={styles.guestAuthActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.guestLoginButton,
                  pressed && styles.pressed,
                ]}
                onPress={goToLogin}
              >
                <Text style={styles.guestLoginButtonText}>로그인</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.guestSignupButton,
                  pressed && styles.pressed,
                ]}
                onPress={goToSignup}
              >
                <Text style={styles.guestSignupButtonText}>회원가입</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.applyButton,
                isApplyButtonDisabled && styles.applyButtonDisabled,
                pressed &&
                  !isApplyButtonDisabled &&
                  styles.pressed,
              ]}
              disabled={isApplyButtonDisabled}
              onPress={handleApply}
            >
              <Text style={styles.applyButtonText}>
                {isApplying
                  ? '신청 보내는 중'
                  : selectedClassSeatsFull
                  ? '마감된 문화교류'
                  : hasSession === null
                  ? '로그인 확인 중'
                  : selectedChildren.length > 1
                  ? `${selectedChildren.length}명 신청하기`
                  : selectedChildren.length === 0
                  ? '신청할 아이 선택하기'
                  : '신청하기'}
              </Text>
            </Pressable>
          )
        }
      >
        <View style={styles.childSelectSection}>
          {hasSession === false ? (
            <View style={styles.guestApplyNotice}>
              <Text style={styles.guestApplyNoticeTitle}>
                클래스 신청은 로그인이 필요해요
              </Text>
              <Text style={styles.guestApplyNoticeText}>
                계정이 있다면 로그인하고, 처음이라면 회원가입 후 클래스를
                신청할 수 있어요.
              </Text>
            </View>
          ) : children.length > 0 ? (
            <>
              <Text style={styles.childSelectTitle}>신청할 아이</Text>
            <View style={styles.childChipRow}>
              {children.map((child) => {
                const isActive = selectedChildIds.includes(child.id);
                const activeApplication = selectedClass
                  ? getChildActiveApplication(selectedClass.id, child.id)
                  : undefined;
                const alreadyApplied = Boolean(activeApplication);

                return (
                  <Pressable
                    key={child.id}
                    style={[
                      styles.childChip,
                      isActive && styles.activeChildChip,
                      !isActive && styles.inactiveChildChip,
                      alreadyApplied &&
                        (activeApplication?.status !== '신청 완료'
                          ? styles.pendingChildChip
                          : styles.appliedChildChip),
                    ]}
                    onPress={() => toggleChild(child.id)}
                  >
                    <Text
                      style={[
                        styles.childChipText,
                        isActive && styles.activeChildChipText,
                        alreadyApplied &&
                          (activeApplication?.status !== '신청 완료'
                            ? styles.pendingChildChipText
                            : styles.appliedChildChipText),
                      ]}
                    >
                      {alreadyApplied
                        ? getApplicationBadgeLabel(
                            child.fullName,
                            activeApplication?.status ?? '신청 완료',
                          )
                        : child.fullName}
                    </Text>
                  </Pressable>
                );
              })}

              <Pressable style={styles.addChildChip} onPress={goToMyPage}>
                <Text style={styles.addChildChipText}>+ 아이 추가</Text>
              </Pressable>
            </View>
            </>
          ) : (
            <>
              <Text style={styles.childSelectTitle}>신청할 아이</Text>
              <View style={styles.emptyChildBox}>
                <Text style={styles.emptyChildText}>
                  등록된 아이가 없어요. 마이페이지에서 먼저 아이를 등록해주세요.
                </Text>
                <Pressable style={styles.goMyButton} onPress={goToMyPage}>
                  <Text style={styles.goMyButtonText}>마이페이지로 가기</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </ClassDetailSheet>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  guideOverlay: {
    flex: 1,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 46, 75, 0.34)',
  },
  guideCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    backgroundColor: colors.cardSolid,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    shadowColor: colors.navy,
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  guideBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    marginBottom: 14,
    backgroundColor: colors.honey,
  },
  guideBadgeText: {
    color: colors.navy,
    fontSize: 12,
    fontFamily: 'Pretendard-Bold',
  },
  guideTitle: {
    color: colors.navy,
    fontSize: 23,
    lineHeight: 31,
    fontFamily: 'Pretendard-Bold',
    marginBottom: 10,
  },
  guideText: {
    color: colors.navySoft,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'Pretendard-Medium',
  },
  guideList: {
    gap: 10,
    marginTop: 18,
    marginBottom: 20,
  },
  guideListRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  guideDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    marginTop: 6,
    backgroundColor: colors.orange,
  },
  guideListText: {
    flex: 1,
    color: colors.navy,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: 'Pretendard-Medium',
  },
  guideActions: {
    gap: 10,
  },
  guideSecondaryButton: {
    height: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  guideSecondaryButtonText: {
    color: colors.navySoft,
    fontSize: 14,
    fontFamily: 'Pretendard-Bold',
  },
  guidePrimaryButton: {
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
  },
  guidePrimaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontFamily: 'Pretendard-Bold',
  },
  header: {
    marginBottom: 28,
  },
  brandRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  guestBackButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: authColors.navy,
  },
  title: {
    color: authColors.text,
    fontFamily: 'Pretendard-Bold',
    fontSize: 23,
    lineHeight: 30,
    letterSpacing: -0.6,
  },
  guestGuideOverlay: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 46, 75, 0.34)',
  },
  guestGuideCard: {
    width: '100%',
    maxWidth: 380,
    padding: 22,
    borderRadius: 20,
    backgroundColor: colors.cardSolid,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    shadowColor: colors.navy,
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  guestGuideTitle: {
    color: colors.navy,
    fontSize: 21,
    lineHeight: 29,
    fontFamily: 'Pretendard-Bold',
    marginBottom: 10,
  },
  guestGuideText: {
    color: colors.navySoft,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'Pretendard-Medium',
    marginBottom: 20,
  },
  guestGuideButton: {
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
  },
  guestGuideButtonText: {
    color: colors.white,
    fontSize: 16,
    fontFamily: 'Pretendard-Bold',
  },
  schoolSection: {
    marginBottom: 24,
  },
  sectionLabel: {
    color: authColors.text,
    fontFamily: 'Pretendard-Bold',
    fontSize: 21,
    letterSpacing: -0.42,
    marginBottom: 16,
  },
  schoolRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  schoolChip: {
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: authColors.white,
  },
  activeSchoolChip: {
    backgroundColor: authColors.navy,
  },
  schoolChipText: {
    color: authColors.navy,
    fontFamily: 'Pretendard-Medium',
    letterSpacing: -0.42,
  },
  activeSchoolChipText: {
    color: authColors.white,
    fontFamily: 'Pretendard-Bold',
  },
  classSection: {
    marginBottom: 12,
  },
  classHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  classHeaderTitle: {
    color: colors.navy,
    flexShrink: 1,
    fontSize: 22,
    fontFamily: 'Pretendard-Bold',
  },
  classHeaderCount: {
    color: colors.muted,
    fontSize: 13,
    fontFamily: 'Pretendard-Bold',
  },
  cardList: {
    gap: 14,
  },
  errorCard: {
    backgroundColor: '#FFE1E4',
    borderRadius: 20,
    gap: 5,
    marginBottom: 14,
    padding: 14,
  },
  errorTitle: {
    color: '#C52C3A',
    fontSize: 14,
    fontFamily: 'Pretendard-Bold',
  },
  errorText: {
    color: '#8F2F39',
    fontSize: 12,
    fontFamily: 'Pretendard-Medium',
    lineHeight: 18,
  },
  emptyClassCard: {
    padding: 22,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.86)',
    alignItems: 'center',
    marginTop: 14,
  },
  emptyClassTitle: {
    color: colors.navy,
    fontSize: 18,
    fontFamily: 'Pretendard-Bold',
    marginBottom: 7,
  },
  emptyClassText: {
    color: colors.muted,
    fontSize: 13,
    fontFamily: 'Pretendard-Medium',
    textAlign: 'center',
    lineHeight: 20,
  },
  childSelectSection: {
    marginBottom: 18,
  },
  guestApplyNotice: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.white,
    gap: 6,
  },
  guestApplyNoticeTitle: {
    color: colors.navy,
    fontSize: 15,
    fontFamily: 'Pretendard-Bold',
  },
  guestApplyNoticeText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'Pretendard-Medium',
  },
  guestAuthActions: {
    flexDirection: 'row',
    gap: 10,
  },
  guestLoginButton: {
    flex: 1,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
  },
  guestLoginButtonText: {
    color: colors.white,
    fontSize: 16,
    fontFamily: 'Pretendard-Bold',
  },
  guestSignupButton: {
    flex: 1,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.honey,
  },
  guestSignupButtonText: {
    color: colors.navy,
    fontSize: 16,
    fontFamily: 'Pretendard-Bold',
  },
  childSelectTitle: {
    color: colors.navy,
    fontSize: 15,
    fontFamily: 'Pretendard-Bold',
    marginBottom: 10,
  },
  childChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  childChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  activeChildChip: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  inactiveChildChip: {
    opacity: 0.42,
  },
  appliedChildChip: {
    backgroundColor: colors.mint,
    borderColor: colors.mint,
    opacity: 1,
  },
  pendingChildChip: {
    backgroundColor: '#FFF1C7',
    borderColor: '#F5D36B',
    opacity: 1,
  },
  childChipText: {
    color: colors.navy,
    fontSize: 13,
    fontFamily: 'Pretendard-Bold',
  },
  activeChildChipText: {
    color: colors.white,
  },
  appliedChildChipText: {
    color: colors.green,
  },
  pendingChildChipText: {
    color: '#9A6B00',
  },
  addChildChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.honey,
  },
  addChildChipText: {
    color: colors.navy,
    fontSize: 13,
    fontFamily: 'Pretendard-Bold',
  },
  emptyChildBox: {
    padding: 15,
    borderRadius: 20,
    backgroundColor: colors.white,
    gap: 12,
  },
  emptyChildText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'Pretendard-Medium',
  },
  goMyButton: {
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.honey,
  },
  goMyButtonText: {
    color: colors.navy,
    fontSize: 14,
    fontFamily: 'Pretendard-Bold',
  },
  applyButton: {
    height: 58,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
  },
  applyButtonDisabled: {
    opacity: 0.42,
  },
  applyButtonText: {
    color: colors.white,
    fontSize: 16,
    fontFamily: 'Pretendard-Bold',
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
});
