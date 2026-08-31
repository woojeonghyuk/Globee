import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ScreenShell from '@/src/components/ScreenShell';
import SectionHeader from '@/src/components/SectionHeader';
import { useChildProfiles } from '@/src/state/ChildProfilesContext';
import { useCompletedRecords } from '@/src/state/CompletedRecordsContext';
import { colors } from '@/src/theme/colors';

type GalleryPhoto = {
  id: string;
  uri: string;
  fileName: string;
};

type SelectedGallery = {
  classTitle: string;
  country: string;
  flag: string;
  photos: GalleryPhoto[];
  index: number;
};

function formatCompletedDate(completedAt: string) {
  const dateMatch = completedAt.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    return `${Number(dateMatch[2])}월 ${Number(dateMatch[3])}일`;
  }

  const date = new Date(completedAt);
  if (!Number.isNaN(date.getTime())) {
    return `${date.getMonth() + 1}월 ${date.getDate()}일`;
  }

  return completedAt;
}

function getSafePhotoFileName(fileName: string) {
  const hasImageExtension = /\.(jpe?g|png|webp)$/i.test(fileName);
  const safeName = (fileName || `globee-photo-${Date.now()}.jpg`).replace(
    /[^a-zA-Z0-9._-]/g,
    '-',
  );

  return hasImageExtension ? safeName : `${safeName}.jpg`;
}

export default function CompletedClassesScreen() {
  const { completedRecords, refreshCompletedRecords } = useCompletedRecords();
  const { children } = useChildProfiles();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [selectedGallery, setSelectedGallery] = useState<SelectedGallery | null>(
    null,
  );
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);

  const photoPageWidth = Math.max(width - 36, 1);
  const activePhoto = selectedGallery?.photos[selectedGallery.index] ?? null;
  const activeChildId =
    children.length > 0 ? selectedChildId ?? children[0].id : null;
  const visibleCompletedRecords = activeChildId
    ? completedRecords.filter((record) => record.childId === activeChildId)
    : completedRecords;

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

  const openGallery = (
    gallery: Omit<SelectedGallery, 'index'>,
    index: number,
  ) => {
    if (gallery.photos.length === 0) return;

    setSelectedGallery({
      ...gallery,
      index,
    });
  };

  const handleGalleryScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    if (!selectedGallery) return;

    const nextIndex = Math.round(
      event.nativeEvent.contentOffset.x / photoPageWidth,
    );
    const safeIndex = Math.min(
      Math.max(nextIndex, 0),
      selectedGallery.photos.length - 1,
    );

    if (safeIndex !== selectedGallery.index) {
      setSelectedGallery({
        ...selectedGallery,
        index: safeIndex,
      });
    }
  };

  const handleSavePhoto = async () => {
    if (!activePhoto || isSavingPhoto) return;

    try {
      setIsSavingPhoto(true);

      const cacheDirectory = FileSystem.cacheDirectory;
      if (!cacheDirectory) {
        Alert.alert('저장 실패', '사진을 저장할 공간을 찾지 못했어요.');
        return;
      }

      const isMediaLibraryAvailable = await MediaLibrary.isAvailableAsync();
      if (!isMediaLibraryAvailable) {
        Alert.alert('저장 실패', '이 기기에서는 갤러리 저장을 사용할 수 없어요.');
        return;
      }

      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        Alert.alert(
          '저장 권한 필요',
          '사진을 갤러리에 저장하려면 사진 저장 권한이 필요해요.',
        );
        return;
      }

      const fileName = getSafePhotoFileName(activePhoto.fileName);
      const downloadResult = await FileSystem.downloadAsync(
        activePhoto.uri,
        `${cacheDirectory}${Date.now()}-${fileName}`,
      );

      await MediaLibrary.saveToLibraryAsync(downloadResult.uri);
      Alert.alert('저장 완료', '사진이 갤러리에 저장되었어요.');
    } catch {
      Alert.alert(
        '저장 실패',
        '사진을 갤러리에 저장하지 못했어요. 잠시 후 다시 시도해주세요.',
      );
    } finally {
      setIsSavingPhoto(false);
    }
  };

  return (
    <>
      <ScreenShell>
        <View style={styles.header}>
          <Text style={styles.title}>완료문화</Text>
          <Text style={styles.subtitle}>
            아이가 만난 문화 경험을 여기 한 공간에
          </Text>
        </View>

        <SectionHeader title="문화 기록" />

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

        <View style={styles.list}>
          {visibleCompletedRecords.map((item) => {
            const galleryPhotos = item.photos.map((photo) => ({
              id: photo.id,
              uri: photo.signedUrl,
              fileName: photo.fileName,
            }));

            return (
              <View key={item.id} style={styles.memoryCard}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.photoStrip}
                >
                  <View
                    style={[
                      styles.countryTile,
                      { backgroundColor: item.classItem.imageColor },
                    ]}
                  >
                    <Text style={styles.countryFlag}>{item.classItem.flag}</Text>
                    <Text style={styles.countryName}>
                      {item.classItem.country}
                    </Text>
                    <Text style={styles.countryLabel}>문화 기록</Text>
                  </View>

                  {galleryPhotos.length > 0 ? (
                    galleryPhotos.map((photo, index) => (
                      <Pressable
                        key={photo.id}
                        onPress={() =>
                          openGallery(
                            {
                              classTitle: item.classItem.title,
                              country: item.classItem.country,
                              flag: item.classItem.flag,
                              photos: galleryPhotos,
                            },
                            index,
                          )
                        }
                        style={({ pressed }) => [
                          styles.photoButton,
                          pressed && styles.cardPressed,
                        ]}
                      >
                        <Image
                          accessibilityLabel={`${item.classItem.title} 문화교류 사진`}
                          source={{ uri: photo.uri }}
                          style={styles.memoryPhoto}
                        />
                      </Pressable>
                    ))
                  ) : (
                    <View style={styles.photoEmptyTile}>
                      <Text style={styles.photoEmptyText}>
                        아직 등록된 사진이 없어요.
                      </Text>
                    </View>
                  )}
                </ScrollView>

                <View style={styles.memoryBody}>
                  <Text style={styles.classTitle}>{item.classItem.title}</Text>
                  <Text style={styles.childText}>
                    {formatCompletedDate(item.classStartsAt)} {item.childName} 문화 일지
                  </Text>
                  <Text style={styles.diary}>{item.diary}</Text>
                  <View style={styles.commentBox}>
                    <Text style={styles.commentLabel}>
                      {item.classItem.teacherName} 선생님 코멘트
                    </Text>
                    <Text style={styles.commentText}>{item.teacherComment}</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {visibleCompletedRecords.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>아직 완료된 문화가 없어요</Text>
            <Text style={styles.emptyText}>
              문화가 끝나고 운영진이 기록을 올리면 여기서 보여드릴게요.
            </Text>
          </View>
        ) : null}
      </ScreenShell>

      <Modal
        animationType="fade"
        transparent
        visible={selectedGallery !== null}
        onRequestClose={() => setSelectedGallery(null)}
      >
        <View
          style={[
            styles.modalBackdrop,
            {
              paddingBottom: Math.max(insets.bottom + 16, 28),
              paddingTop: Math.max(insets.top + 16, 48),
            },
          ]}
        >
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleBlock}>
              <Text style={styles.modalCountry}>
                {selectedGallery?.flag} {selectedGallery?.country}
              </Text>
              <Text style={styles.modalTitle}>{selectedGallery?.classTitle}</Text>
              {selectedGallery ? (
                <Text style={styles.modalCounter}>
                  {selectedGallery.index + 1} / {selectedGallery.photos.length}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => setSelectedGallery(null)}
              style={styles.modalCloseButton}
            >
              <Text style={styles.modalCloseText}>닫기</Text>
            </Pressable>
          </View>

          {selectedGallery ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentOffset={{
                x: photoPageWidth * selectedGallery.index,
                y: 0,
              }}
              onMomentumScrollEnd={handleGalleryScrollEnd}
            >
              {selectedGallery.photos.map((photo) => (
                <View
                  key={photo.id}
                  style={[styles.modalPhotoPage, { width: photoPageWidth }]}
                >
                  <Image
                    resizeMode="contain"
                    source={{ uri: photo.uri }}
                    style={styles.modalPhoto}
                  />
                </View>
              ))}
            </ScrollView>
          ) : null}

          <Pressable
            disabled={isSavingPhoto}
            onPress={handleSavePhoto}
            style={({ pressed }) => [
              styles.saveButton,
              isSavingPhoto && styles.saveButtonDisabled,
              pressed && styles.cardPressed,
            ]}
          >
            <Text style={styles.saveButtonText}>
              {isSavingPhoto ? '준비 중' : '현재 사진 저장하기'}
            </Text>
          </Pressable>
        </View>
      </Modal>
    </>
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
  list: {
    gap: 16,
  },
  memoryCard: {
    overflow: 'hidden',
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
  cardPressed: {
    opacity: 0.86,
  },
  photoButton: {
    borderRadius: 20,
  },
  photoStrip: {
    gap: 10,
    padding: 14,
  },
  countryTile: {
    alignItems: 'center',
    borderRadius: 20,
    gap: 6,
    height: 150,
    justifyContent: 'center',
    paddingHorizontal: 12,
    width: 126,
  },
  countryFlag: {
    fontSize: 34,
  },
  countryName: {
    color: colors.navy,
    fontFamily: 'Pretendard-Bold',
    fontSize: 16,
    textAlign: 'center',
  },
  countryLabel: {
    color: colors.navySoft,
    fontFamily: 'Pretendard-Bold',
    fontSize: 12,
  },
  memoryPhoto: {
    width: 220,
    height: 150,
    borderRadius: 20,
    backgroundColor: colors.background,
  },
  photoEmptyTile: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 20,
    height: 150,
    justifyContent: 'center',
    paddingHorizontal: 16,
    width: 220,
  },
  photoEmptyText: {
    color: colors.muted,
    fontFamily: 'Pretendard-Medium',
    fontSize: 13,
    textAlign: 'center',
  },
  memoryBody: {
    paddingBottom: 18,
    paddingHorizontal: 18,
  },
  classTitle: {
    color: colors.navy,
    fontFamily: 'Pretendard-Bold',
    fontSize: 20,
    lineHeight: 26,
    marginBottom: 7,
  },
  childText: {
    color: colors.orange,
    fontFamily: 'Pretendard-Bold',
    fontSize: 13,
    marginBottom: 11,
  },
  diary: {
    color: colors.text,
    fontFamily: 'Pretendard-Medium',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 14,
  },
  commentBox: {
    padding: 14,
    borderRadius: 20,
    backgroundColor: colors.background,
  },
  commentLabel: {
    color: colors.navy,
    fontFamily: 'Pretendard-Bold',
    fontSize: 12,
    marginBottom: 6,
  },
  commentText: {
    color: colors.muted,
    fontFamily: 'Pretendard-Medium',
    fontSize: 13,
    lineHeight: 20,
  },
  emptyCard: {
    padding: 24,
    borderRadius: 20,
    backgroundColor: colors.white,
    alignItems: 'center',
    marginTop: 18,
  },
  emptyTitle: {
    color: colors.navy,
    fontFamily: 'Pretendard-Bold',
    fontSize: 19,
    marginBottom: 8,
  },
  emptyText: {
    color: colors.muted,
    fontFamily: 'Pretendard-Medium',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 15, 27, 0.94)',
    paddingBottom: 28,
    paddingHorizontal: 18,
    paddingTop: 48,
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitleBlock: {
    flex: 1,
    gap: 5,
  },
  modalCountry: {
    color: colors.honey,
    fontFamily: 'Pretendard-Bold',
    fontSize: 14,
  },
  modalTitle: {
    color: colors.white,
    fontFamily: 'Pretendard-Bold',
    fontSize: 20,
  },
  modalCounter: {
    color: 'rgba(255,255,255,0.72)',
    fontFamily: 'Pretendard-Bold',
    fontSize: 13,
  },
  modalCloseButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  modalCloseText: {
    color: colors.white,
    fontFamily: 'Pretendard-Bold',
    fontSize: 14,
  },
  modalPhotoPage: {
    flex: 1,
    justifyContent: 'center',
  },
  modalPhoto: {
    height: '100%',
    width: '100%',
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.honey,
    borderRadius: 8,
    height: 56,
    justifyContent: 'center',
    marginTop: 18,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: colors.navy,
    fontFamily: 'Pretendard-Bold',
    fontSize: 17,
  },
});
