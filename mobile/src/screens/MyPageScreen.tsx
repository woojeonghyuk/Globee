import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import ScreenShell from '@/src/components/ScreenShell';
import { ChildProfile } from '@/src/data/classes';
import { PRIVACY_POLICY_URL, TERMS_URL } from '@/src/lib/legalConsent';
import { supabase, supabaseAnonKey, supabaseUrl } from '@/src/lib/supabase';
import { useApplications } from '@/src/state/ApplicationsContext';
import { useChildProfiles } from '@/src/state/ChildProfilesContext';
import { useCompletedRecords } from '@/src/state/CompletedRecordsContext';
import { authColors } from '@/src/theme/auth';
import { colors } from '@/src/theme/colors';

type FormState = {
  fullName: string;
  age: string;
  school: string;
  interestsText: string;
  note: string;
  gender: ChildProfile['gender'];
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

const emptyForm: FormState = {
  fullName: '',
  age: '',
  school: '',
  interestsText: '',
  note: '',
  gender: 'boy',
};

const activeApplicationStatuses = new Set([
  '신청 확인중',
  '신청 완료',
  '확정 대기',
]);

function normalizeChildName(value: string) {
  return value.replace(/\s/g, '').toLowerCase();
}

function getDeleteAccountErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';

  if (message.includes('세션') || message.toLowerCase().includes('session')) {
    return '로그인 세션이 만료됐어요. 다시 로그인한 뒤 시도해주세요.';
  }

  if (message.toLowerCase().includes('parent')) {
    return '학부모 계정만 앱에서 탈퇴할 수 있어요.';
  }

  if (/[가-힣]/.test(message)) {
    return message;
  }

  return '계정을 삭제하지 못했어요. 잠시 후 다시 시도해주세요.';
}

export default function MyPageScreen() {
  const params = useLocalSearchParams<{ openAddChild?: string | string[] }>();
  const {
    children,
    addChild,
    updateChild,
    deleteChild,
  } = useChildProfiles();
  const { applications } = useApplications();
  const { completedRecords } = useCompletedRecords();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSavingChild, setIsSavingChild] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const openLegalPage = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('페이지 열기 실패', '잠시 후 다시 시도해주세요.');
    }
  };

  const isEditMode = useMemo(() => selectedChildId !== null, [selectedChildId]);
  const openAddChildParam = Array.isArray(params.openAddChild)
    ? params.openAddChild[0]
    : params.openAddChild;

  const resetForm = () => {
    setSelectedChildId(null);
    setForm(emptyForm);
    setErrors({});
  };

  const openAddModal = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEditModal = (child: ChildProfile) => {
    setSelectedChildId(child.id);
    setForm({
      fullName: child.fullName,
      age: String(child.age),
      school: child.school,
      interestsText: child.interests.join(', '),
      note: child.note,
      gender: child.gender,
    });
    setErrors({});
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    resetForm();
  };

  useEffect(() => {
    if (openAddChildParam !== '1' || modalVisible) {
      return;
    }

    setSelectedChildId(null);
    setForm(emptyForm);
    setErrors({});
    setModalVisible(true);
    router.setParams({ openAddChild: undefined });
  }, [modalVisible, openAddChildParam]);

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
    setErrors((current) => {
      if (!current[key]) return current;

      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const getInterests = () => {
    const seenInterests = new Set<string>();

    return form.interestsText
      .split(',')
      .map((item) => item.trim())
      .filter((item) => {
        if (!item) return false;

        const key = item.toLowerCase();
        if (seenInterests.has(key)) return false;

        seenInterests.add(key);
        return true;
      });
  };

  const validateForm = () => {
    const nextErrors: FieldErrors = {};
    const fullName = form.fullName.trim();
    const normalizedFullName = normalizeChildName(fullName);
    const school = form.school.trim();
    const note = form.note.trim();
    const ageText = form.age.trim();
    const ageNumber = Number(ageText);
    const interests = getInterests();

    if (!fullName) {
      nextErrors.fullName = '이름을 입력해주세요.';
    } else if (fullName.length < 2) {
      nextErrors.fullName = '이름은 2자 이상 입력해주세요.';
    } else {
      const hasSameName = children.some((child) => {
        if (child.id === selectedChildId) return false;

        return normalizeChildName(child.fullName) === normalizedFullName;
      });

      if (hasSameName) {
        nextErrors.fullName = '같은 이름의 아이가 이미 등록되어 있어요.';
      }
    }

    if (!ageText) {
      nextErrors.age = '나이를 입력해주세요.';
    } else if (!Number.isInteger(ageNumber) || ageNumber < 8 || ageNumber > 13) {
      nextErrors.age = '나이는 8세부터 13세까지 입력할 수 있어요.';
    }

    if (!school) {
      nextErrors.school = '학교 / 학년을 입력해주세요.';
    }

    if (interests.length === 0) {
      nextErrors.interestsText = '선호 키워드를 1개 이상 입력해주세요.';
    }

    if (!note) {
      nextErrors.note = '한 줄 소개를 입력해주세요.';
    }

    setErrors(nextErrors);

    const firstError = Object.values(nextErrors)[0];
    if (firstError) {
      Alert.alert('입력 확인', firstError);
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (isSavingChild) return;
    if (!validateForm()) return;
    Keyboard.dismiss();

    const payload: Omit<ChildProfile, 'id'> = {
      fullName: form.fullName.trim(),
      age: Number(form.age),
      school: form.school.trim(),
      interests: getInterests().slice(0, 5),
      note: form.note.trim(),
      gender: form.gender,
    };

    try {
      setIsSavingChild(true);

      if (selectedChildId) {
        await updateChild(selectedChildId, payload);
      } else {
        await addChild(payload);
      }

      closeModal();
    } catch {
      Alert.alert(
        '저장 실패',
        '아이 정보를 저장하지 못했어요. 잠시 후 다시 시도해주세요.',
      );
    } finally {
      setIsSavingChild(false);
    }
  };

  const handleDelete = () => {
    if (!selectedChildId) return;

    const hasActiveApplication = applications.some(
      (application) =>
        application.childId === selectedChildId &&
        activeApplicationStatuses.has(application.status),
    );

    if (hasActiveApplication) {
      Alert.alert(
        '진행 중인 신청이 있어요',
        '이 아이의 확인 중이거나 신청 완료된 문화교류가 있어요. 먼저 신청내역에서 취소하거나 운영진 처리 후 삭제해주세요.',
      );
      return;
    }

    const hasCompletedRecord = completedRecords.some(
      (record) => record.childId === selectedChildId,
    );

    if (hasCompletedRecord) {
      Alert.alert(
        '완료문화 기록이 있어요',
        '이 아이의 완료문화와 스탬프 기록이 있어서 앱에서 바로 삭제할 수 없어요. 기록 정리가 필요하면 운영진에게 문의해주세요.',
      );
      return;
    }

    Alert.alert('아이 정보 삭제', '이 아이 정보를 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteChild(selectedChildId);
            closeModal();
          } catch {
            Alert.alert(
              '삭제 실패',
              '아이 정보를 삭제하지 못했어요. 잠시 후 다시 시도해주세요.',
            );
          }
        },
      },
    ]);
  };

  const handleLogout = () => {
    Alert.alert('로그아웃', '현재 계정에서 로그아웃할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/login');
        },
      },
    ]);
  };

  const deleteAccount = async () => {
    if (isDeletingAccount) return;

    try {
      setIsDeletingAccount(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('로그인 세션이 만료됐어요. 다시 로그인한 뒤 시도해주세요.');
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
        method: 'POST',
        headers: {
          apikey: supabaseAnonKey ?? '',
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const responseText = await response.text();
        let message = responseText;

        try {
          const parsed = JSON.parse(responseText) as { error?: string };
          message = parsed.error || responseText;
        } catch {
          // Keep the raw text response.
        }

        throw new Error(
          message || `회원 탈퇴 요청이 실패했어요. (${response.status})`,
        );
      }

      await supabase.auth.signOut();
      router.replace('/');
    } catch (error) {
      Alert.alert(
        '회원 탈퇴 실패',
        getDeleteAccountErrorMessage(error),
      );
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleDeleteAccount = () => {
    if (isDeletingAccount) return;

    Alert.alert(
      '회원 탈퇴',
      '계정과 등록한 아이 정보, 신청 내역, 완료문화 기록이 삭제됩니다. 삭제 후에는 되돌릴 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴 계속',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              '정말 탈퇴할까요?',
              '탈퇴하면 같은 계정의 기록을 다시 복구할 수 없어요.',
              [
                { text: '취소', style: 'cancel' },
                {
                  text: '최종 탈퇴',
                  style: 'destructive',
                  onPress: deleteAccount,
                },
              ],
            );
          },
        },
      ],
    );
  };

  const renderAvatar = (gender: ChildProfile['gender']) => {
    const isBoy = gender === 'boy';

    return (
      <View style={[styles.avatar, isBoy ? styles.avatarBoy : styles.avatarGirl]}>
        <MaterialCommunityIcons
          name={isBoy ? 'baby-face-outline' : 'face-woman-outline'}
          size={28}
          color={colors.navy}
        />
      </View>
    );
  };

  const getInputStyle = (key: keyof FieldErrors) => [
    styles.input,
    errors[key] && styles.inputError,
  ];

  const renderError = (key: keyof FieldErrors) =>
    errors[key] ? <Text style={styles.errorText}>{errors[key]}</Text> : null;

  return (
    <ScreenShell>
      <View style={styles.header}>
        <Text style={styles.title}>내 아이 정보</Text>
      </View>

      <View style={styles.childList}>
        {children.map((child) => (
          <Pressable
            key={child.id}
            style={({ pressed }) => [styles.childCard, pressed && styles.pressed]}
            onPress={() => openEditModal(child)}
          >
            {renderAvatar(child.gender)}

            <View style={styles.childBody}>
              <View style={styles.childTopRow}>
                <Text style={styles.childName}>{child.fullName}</Text>
                <Text style={styles.childAge}>{child.age}세</Text>
              </View>

              <Text style={styles.school}>{child.school}</Text>

              <View style={styles.interestRow}>
                {child.interests.map((interest, index) => (
                  <View key={`${child.id}-${interest}-${index}`} style={styles.interestChip}>
                    <Text style={styles.interestText}>{interest}</Text>
                  </View>
                ))}
              </View>

              {!!child.note && <Text style={styles.note}>{child.note}</Text>}
            </View>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        onPress={openAddModal}
      >
        <Text style={styles.addButtonText}>+ 아이 등록하기</Text>
      </Pressable>

      <View style={styles.accountSection}>
        <Text style={styles.accountTitle}>계정 관리</Text>

        <View style={styles.accountActions}>
          <Pressable
            style={({ pressed }) => [
              styles.accountActionButton,
              styles.logoutButton,
              pressed && styles.pressed,
            ]}
            onPress={handleLogout}
          >
            <Text style={styles.logoutText}>로그아웃</Text>
          </Pressable>

          <Pressable
            disabled={isDeletingAccount}
            style={({ pressed }) => [
              styles.accountActionButton,
              isDeletingAccount && styles.accountActionDisabled,
              pressed && styles.pressed,
            ]}
            onPress={handleDeleteAccount}
          >
            <Text style={styles.deleteAccountText}>
              {isDeletingAccount ? '탈퇴 처리 중' : '회원 탈퇴'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.legalLinks}>
          <Pressable
            onPress={() =>
              router.push({ pathname: '/consent', params: { mode: 'settings' } })
            }
          >
            <Text style={styles.legalLinkText}>동의 설정</Text>
          </Pressable>
          <Text style={styles.legalLinkDivider}>·</Text>
          <Pressable onPress={() => void openLegalPage(PRIVACY_POLICY_URL)}>
            <Text style={styles.legalLinkText}>개인정보처리방침</Text>
          </Pressable>
          <Text style={styles.legalLinkDivider}>·</Text>
          <Pressable onPress={() => void openLegalPage(TERMS_URL)}>
            <Text style={styles.legalLinkText}>이용약관</Text>
          </Pressable>
        </View>
      </View>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={styles.modalWrapper}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={styles.modalTitleWrap}>
                  <Text style={styles.modalLabel}>
                    {isEditMode ? '아이 정보 수정' : '아이 등록'}
                  </Text>
                  <Text style={styles.modalTitle}>
                    {isEditMode
                      ? '아이 정보를 수정해 주세요'
                      : '내 아이 정보를 입력해 주세요'}
                  </Text>
                </View>

                <Pressable onPress={closeModal} style={styles.closeButton}>
                  <MaterialCommunityIcons name="close" size={22} color={colors.navy} />
                </Pressable>
              </View>

              <ScrollView
                showsVerticalScrollIndicator
                persistentScrollbar
                keyboardShouldPersistTaps="always"
                contentContainerStyle={styles.modalScrollContent}
              >
                <View style={styles.formSection}>
                  <Text style={styles.inputLabel}>이름</Text>
                  <TextInput
                    value={form.fullName}
                    onChangeText={(value) => updateForm('fullName', value)}
                    placeholder="예: 김민준"
                    placeholderTextColor={colors.muted}
                    style={getInputStyle('fullName')}
                    returnKeyType="next"
                  />
                  {renderError('fullName')}
                </View>

                <View style={styles.row}>
                  <View style={[styles.formSection, styles.half]}>
                    <Text style={styles.inputLabel}>나이</Text>
                    <TextInput
                      value={form.age}
                      onChangeText={(value) =>
                        updateForm('age', value.replace(/[^0-9]/g, ''))
                      }
                      placeholder="예: 8"
                      placeholderTextColor={colors.muted}
                      keyboardType={Platform.OS === 'ios' ? 'phone-pad' : 'number-pad'}
                      style={getInputStyle('age')}
                    />
                    {renderError('age')}
                  </View>

                  <View style={[styles.formSection, styles.half]}>
                    <Text style={styles.inputLabel}>성별</Text>
                    <View style={styles.genderRow}>
                      <Pressable
                        style={[
                          styles.genderButton,
                          form.gender === 'boy' && styles.genderButtonActive,
                        ]}
                        onPress={() => updateForm('gender', 'boy')}
                      >
                        <MaterialCommunityIcons
                          name="baby-face-outline"
                          size={18}
                          color={colors.navy}
                        />
                        <Text
                          style={[
                            styles.genderText,
                            form.gender === 'boy' && styles.genderTextActive,
                          ]}
                        >
                          남아
                        </Text>
                      </Pressable>

                      <Pressable
                        style={[
                          styles.genderButton,
                          form.gender === 'girl' && styles.genderButtonActive,
                        ]}
                        onPress={() => updateForm('gender', 'girl')}
                      >
                        <MaterialCommunityIcons
                          name="face-woman-outline"
                          size={18}
                          color={colors.navy}
                        />
                        <Text
                          style={[
                            styles.genderText,
                            form.gender === 'girl' && styles.genderTextActive,
                          ]}
                        >
                          여아
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>

                <View style={styles.formSection}>
                  <Text style={styles.inputLabel}>학교 / 학년</Text>
                  <TextInput
                    value={form.school}
                    onChangeText={(value) => updateForm('school', value)}
                    placeholder="예: 공릉초 3학년"
                    placeholderTextColor={colors.muted}
                    style={getInputStyle('school')}
                    returnKeyType="next"
                  />
                  {renderError('school')}
                </View>

                <View style={styles.formSection}>
                  <Text style={styles.inputLabel}>선호 키워드</Text>
                  <TextInput
                    value={form.interestsText}
                    onChangeText={(value) => updateForm('interestsText', value)}
                    placeholder="예: 음식, 퀴즈, 만들기"
                    placeholderTextColor={colors.muted}
                    style={getInputStyle('interestsText')}
                    returnKeyType="next"
                  />
                  {renderError('interestsText')}
                  <Text style={styles.helperText}>
                    쉼표(,)로 구분해서 최대 5개까지 입력할 수 있어요.
                  </Text>
                </View>

                <View style={styles.formSection}>
                  <Text style={styles.inputLabel}>한 줄 소개</Text>
                  <TextInput
                    value={form.note}
                    onChangeText={(value) => updateForm('note', value)}
                    placeholder="예: 활동적인 문화교류와 그림 그리기를 좋아해요. 영어를 잘 못해도 말을 많이 걸어요. 낯을 많이 가려요"
                    placeholderTextColor={colors.muted}
                    multiline
                    style={[getInputStyle('note'), styles.textarea]}
                    textAlignVertical="top"
                  />
                  {renderError('note')}
                </View>

              </ScrollView>

              <View style={styles.modalFooter}>
                {isEditMode ? (
                  <Pressable
                    disabled={isSavingChild}
                    style={styles.deleteButton}
                    onPress={handleDelete}
                  >
                    <Text style={styles.deleteButtonText}>삭제</Text>
                  </Pressable>
                ) : null}

                <Pressable
                  disabled={isSavingChild}
                  style={[
                    styles.saveButton,
                    isSavingChild && styles.saveButtonDisabled,
                  ]}
                  onPress={handleSave}
                >
                  <Text style={styles.saveButtonText}>
                    {isSavingChild
                      ? '저장 중'
                      : isEditMode
                        ? '수정 완료'
                        : '등록하기'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  childList: {
    width: '100%',
    gap: 12,
    marginBottom: 12,
  },
  childCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: authColors.white,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBoy: {
    backgroundColor: authColors.yellow,
  },
  avatarGirl: {
    backgroundColor: '#F6C9DD',
  },
  childBody: {
    flex: 1,
  },
  childTopRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  childName: {
    color: authColors.text,
    fontFamily: 'Pretendard-Bold',
    fontSize: 18,
    letterSpacing: -0.54,
  },
  childAge: {
    color: '#FF9F43',
    fontFamily: 'Pretendard-Medium',
    fontSize: 14,
    letterSpacing: -0.42,
  },
  school: {
    color: authColors.textMuted,
    fontFamily: 'Pretendard-Medium',
    fontSize: 14,
    letterSpacing: -0.42,
    marginBottom: 16,
  },
  interestRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  interestChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#F5F5F5',
  },
  interestText: {
    color: colors.muted,
    fontFamily: 'Pretendard-Bold',
    fontSize: 12,
    letterSpacing: -0.36,
  },
  note: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'Pretendard-Medium',
    opacity: 0.78,
    marginTop: 8,
  },
  addButton: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
    marginBottom: 20,
  },
  addButtonText: {
    color: authColors.white,
    fontFamily: 'Pretendard-Bold',
    fontSize: 15,
    letterSpacing: -0.45,
  },
  accountSection: {
    marginTop: 0,
    marginBottom: 8,
  },
  accountTitle: {
    color: colors.muted,
    fontFamily: 'Pretendard-Medium',
    fontSize: 13,
    letterSpacing: -0.39,
    marginBottom: 16,
  },
  accountActions: {
    width: '100%',
    gap: 10,
  },
  accountActionButton: {
    width: '100%',
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutButton: {
    borderWidth: 1,
    borderColor: '#EDE3C7',
  },
  accountActionDisabled: {
    opacity: 0.55,
  },
  logoutText: {
    color: colors.navy,
    fontFamily: 'Pretendard-Bold',
    fontSize: 14,
    letterSpacing: -0.42,
  },
  deleteAccountText: {
    color: '#D93636',
    fontFamily: 'Pretendard-Medium',
    fontSize: 14,
    letterSpacing: -0.42,
  },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  legalLinkText: {
    color: colors.navySoft,
    fontSize: 12,
    fontFamily: 'Pretendard-Medium',
    textDecorationLine: 'underline',
  },
  legalLinkDivider: {
    color: colors.navySoft,
    fontSize: 12,
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  modalWrapper: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 46, 75, 0.28)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    maxHeight: '88%',
    borderRadius: 30,
    backgroundColor: '#FFFDF7',
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  modalTitleWrap: {
    flex: 1,
  },
  modalLabel: {
    color: colors.orange,
    fontSize: 12,
    fontFamily: 'Pretendard-Bold',
    marginBottom: 4,
  },
  modalTitle: {
    color: colors.navy,
    fontSize: 22,
    fontFamily: 'Pretendard-Bold',
    lineHeight: 28,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4EFD8',
  },
  modalScrollContent: {
    paddingBottom: 8,
  },
  formSection: {
    marginBottom: 14,
  },
  inputLabel: {
    color: colors.navy,
    fontSize: 13,
    fontFamily: 'Pretendard-Bold',
    marginBottom: 8,
  },
  input: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: '#F6F1DD',
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.navy,
    fontSize: 14,
    fontFamily: 'Pretendard-Medium',
  },
  inputError: {
    borderColor: '#E64A4A',
    backgroundColor: '#FFF5F5',
  },
  errorText: {
    color: '#D93636',
    fontSize: 12,
    fontFamily: 'Pretendard-Bold',
    marginTop: 6,
  },
  textarea: {
    minHeight: 118,
  },
  helperText: {
    marginTop: 6,
    color: colors.muted,
    fontSize: 12,
    fontFamily: 'Pretendard-Medium',
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  half: {
    flex: 1,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 8,
  },
  genderButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: '#F6F1DD',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  genderButtonActive: {
    borderColor: colors.navy,
    backgroundColor: '#EFE6B7',
  },
  genderText: {
    color: colors.navy,
    fontSize: 13,
    fontFamily: 'Pretendard-Bold',
    opacity: 0.7,
  },
  genderTextActive: {
    opacity: 1,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15, 46, 75, 0.08)',
  },
  deleteButton: {
    flex: 0.9,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3E3E3',
  },
  deleteButtonText: {
    color: '#A05252',
    fontSize: 15,
    fontFamily: 'Pretendard-Bold',
  },
  saveButton: {
    flex: 1.4,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
  },
  saveButtonDisabled: {
    opacity: 0.58,
  },
  saveButtonText: {
    color: colors.white,
    fontSize: 15,
    fontFamily: 'Pretendard-Bold',
  },
});
