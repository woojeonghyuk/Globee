import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { getAdminAuthEmail } from './adminAuth';
import { supabase } from './supabase';
import type {
  AdminProfile,
  ApplicationRow,
  ApplicationStatus,
  CompletedClassPhotoRow,
} from './types';

const statusLabels: Record<ApplicationStatus, string> = {
  applied: '신청 확인중',
  waiting: '확정 대기',
  confirmed: '신청 완료',
  completed: '완료문화',
  no_show: '미참여',
  canceled: '신청 취소',
};

const reviewPendingStatuses = new Set<ApplicationStatus>(['applied']);
const completionReadyStatuses = new Set<ApplicationStatus>(['confirmed']);
const finalizedStatuses = new Set<ApplicationStatus>(['completed', 'no_show']);
const activeStatuses = new Set<ApplicationStatus>([
  'applied',
  'waiting',
  'confirmed',
]);
const photoParticipantStatuses = new Set<ApplicationStatus>([
  'confirmed',
  'completed',
]);
const currentPrivacyPolicyVersion = '2026-08-05';
const currentTermsVersion = '2026-08-05';

type AdminView =
  | 'dashboard'
  | 'applicationReview'
  | 'completion'
  | 'classes'
  | 'deleteClasses';

type CompletionForm = {
  completedAt: string;
  diary: string;
  teacherComment: string;
};

type CompletionPhotoPreview = {
  file: File;
  previewUrl: string;
};

type ProfileRow = {
  id: string;
  role: 'admin' | 'parent';
  full_name: string | null;
  phone: string | null;
};

type GuardianConsentRow = {
  id: string;
  parent_id: string;
  activity_photo_agreed: boolean;
  created_at: string;
};

type ChildRow = {
  id: string;
  parent_id: string;
  full_name: string;
};

type ClassRow = {
  id: string;
  title: string;
  country: string;
  flag: string;
  campus: string;
  teacher_name: string;
  starts_at: string;
  is_open: boolean;
};

type ClassForm = {
  title: string;
  country: string;
  campus: string;
  teacherName: string;
  startsAt: string;
  description: string;
};

type ChildOverview = {
  childId: string;
  childName: string;
  activeApplications: ApplicationRow[];
  completedApplications: ApplicationRow[];
  noShowApplications: ApplicationRow[];
  canceledCount: number;
  stampCountries: string[];
  latestActivityAt: string | null;
};

type UserOverviewRow = {
  parentId: string;
  parentName: string;
  parentPhone: string;
  children: ChildOverview[];
  activeApplications: ApplicationRow[];
  completedApplications: ApplicationRow[];
  noShowApplications: ApplicationRow[];
  canceledCount: number;
  stampCountries: string[];
  latestActivityAt: string | null;
};

type CompletedClassValue = ApplicationRow['completed_classes'];

function getCompletedClasses(value: CompletedClassValue) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

const initialCompletionForm: CompletionForm = {
  completedAt: new Date().toISOString().slice(0, 10),
  diary: '',
  teacherComment: '',
};

const completionPhotoBucket = 'completed-class-photos';
const maxCompletionPhotoCount = 5;
const maxCompletionPhotoSize = 5 * 1024 * 1024;
const allowedCompletionPhotoTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const allowedCompletionPhotoExtensions = new Set(['jpg', 'jpeg', 'png', 'webp']);

type CompletedClassRecord = ReturnType<typeof getCompletedClasses>[number];

function getCompletedPhotos(completion: CompletedClassRecord | undefined) {
  const photos = completion?.completed_class_photos ?? [];

  return [...photos].sort((first, second) => {
    if (first.sort_order !== second.sort_order) {
      return first.sort_order - second.sort_order;
    }

    return (first.created_at ?? '').localeCompare(second.created_at ?? '');
  });
}

function getAllCompletedPhotos(value: CompletedClassValue) {
  return getCompletedClasses(value).flatMap((completion) =>
    getCompletedPhotos(completion),
  );
}

function getPendingReviewBlockMessage(count: number) {
  return `같은 문화교류에 확인중인 신청 ${count}건이 남아 있어요. 신청 확인 탭에서 승인 또는 신청 취소를 모두 완료한 뒤 진행해 주세요.`;
}

function sanitizeStorageFileName(fileName: string) {
  const normalized = fileName.trim().toLowerCase();
  const fallbackName = 'photo.jpg';

  return (normalized || fallbackName).replace(/[^a-z0-9._-]/g, '-');
}

function createCompletionPhotoPath(completedClassId: string, file: File) {
  const safeName = sanitizeStorageFileName(file.name);
  const randomId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${completedClassId}/${Date.now()}-${randomId}-${safeName}`;
}

function getFileExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function isAllowedCompletionPhoto(file: File) {
  return (
    allowedCompletionPhotoTypes.has(file.type) ||
    allowedCompletionPhotoExtensions.has(getFileExtension(file.name))
  );
}

function getCompletionPhotoContentType(file: File) {
  if (allowedCompletionPhotoTypes.has(file.type)) return file.type;

  const extension = getFileExtension(file.name);
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';

  return 'image/jpeg';
}

const campusOptions = [
  '서울과학기술대학교',
  '광운대학교',
  '서울여자대학교',
  '삼육대학교',
];

const initialClassForm: ClassForm = {
  title: '',
  country: '베트남',
  campus: campusOptions[0],
  teacherName: '',
  startsAt: '',
  description: '',
};

const stampCountryOptions = [
  { country: '우크라이나', flag: '🇺🇦', imageColor: '#DDEDFC' },
  { country: '프랑스', flag: '🇫🇷', imageColor: '#DDEDFC' },
  { country: '미국', flag: '🇺🇸', imageColor: '#DDEDFC' },
  { country: '인도', flag: '🇮🇳', imageColor: '#FFE3BA' },
  { country: '캐나다', flag: '🇨🇦', imageColor: '#FAD0C4' },
  { country: '리투아니아', flag: '🇱🇹', imageColor: '#DDF4C8' },
  { country: '칠레', flag: '🇨🇱', imageColor: '#DDEDFC' },
  { country: '스페인', flag: '🇪🇸', imageColor: '#FFE3BA' },
  { country: '일본', flag: '🇯🇵', imageColor: '#FFE3BA' },
  { country: '중국', flag: '🇨🇳', imageColor: '#FAD0C4' },
  { country: '독일', flag: '🇩🇪', imageColor: '#E9E3FF' },
  { country: '이탈리아', flag: '🇮🇹', imageColor: '#DDF4C8' },
  { country: '스웨덴', flag: '🇸🇪', imageColor: '#DDEDFC' },
  { country: '스위스', flag: '🇨🇭', imageColor: '#FAD0C4' },
  { country: '러시아', flag: '🇷🇺', imageColor: '#DDEDFC' },
  { country: '베트남', flag: '🇻🇳', imageColor: '#DDF4C8' },
  { country: '남아프리카공화국', flag: '🇿🇦', imageColor: '#DDF4C8' },
  { country: '터키', flag: '🇹🇷', imageColor: '#FAD0C4' },
  { country: '태국', flag: '🇹🇭', imageColor: '#DDEDFC' },
  { country: '덴마크', flag: '🇩🇰', imageColor: '#FAD0C4' },
  { country: '대만', flag: '🇹🇼', imageColor: '#DDF4C8' },
  { country: '노르웨이', flag: '🇳🇴', imageColor: '#DDEDFC' },
  { country: '영국', flag: '🇬🇧', imageColor: '#E9E3FF' },
  { country: '호주', flag: '🇦🇺', imageColor: '#DDEDFC' },
  { country: '아르헨티나', flag: '🇦🇷', imageColor: '#DDEDFC' },
  { country: '모로코', flag: '🇲🇦', imageColor: '#FAD0C4' },
  { country: '이집트', flag: '🇪🇬', imageColor: '#FFE3BA' },
  { country: '벨기에', flag: '🇧🇪', imageColor: '#FFE3BA' },
  { country: '인도네시아', flag: '🇮🇩', imageColor: '#FAD0C4' },
  { country: '이란', flag: '🇮🇷', imageColor: '#DDF4C8' },
  { country: '케냐', flag: '🇰🇪', imageColor: '#DDF4C8' },
  { country: '방글라데시', flag: '🇧🇩', imageColor: '#DDF4C8' },
  { country: '말레이시아', flag: '🇲🇾', imageColor: '#DDEDFC' },
  { country: '멕시코', flag: '🇲🇽', imageColor: '#FAD0C4' },
  { country: '브라질', flag: '🇧🇷', imageColor: '#DDF4C8' },
];

function formatDateTime(value: string | null) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${month}월 ${day}일 ${hours}:${minutes}`;
}

function formatPhone(value: string | null | undefined) {
  if (!value) return '-';

  if (value.startsWith('+82')) {
    const local = `0${value.slice(3)}`;

    if (local.length === 11) {
      return `${local.slice(0, 3)}-${local.slice(3, 7)}-${local.slice(7)}`;
    }

    return local;
  }

  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  return value;
}

function getClassDate(value: string | undefined) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function getCompletionTitle(application: ApplicationRow) {
  return `${getClassDate(application.classes?.starts_at)} ${
    application.children?.full_name ?? '학생'
  } 문화 일지`;
}

function getApplicationTitlePreview(
  applications: ApplicationRow[],
  emptyText: string,
) {
  const titles = applications
    .map((application) => application.classes?.title)
    .filter((title): title is string => Boolean(title));

  if (titles.length === 0) return emptyText;

  const preview = titles.slice(0, 3).join(', ');
  return titles.length > 3 ? `${preview} 외 ${titles.length - 3}건` : preview;
}

function getCountryOption(country: string) {
  return (
    stampCountryOptions.find((option) => option.country === country) ??
    stampCountryOptions[0]
  );
}

function getLatestActivityAt(applications: ApplicationRow[]) {
  const timestamps = applications.flatMap((application) => [
    application.created_at,
    application.updated_at,
    ...getCompletedClasses(application.completed_classes).map(
      (completion) => completion.completed_at,
    ),
  ]);

  const latest = timestamps
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return latest?.toISOString() ?? null;
}

function getApplicationClassTime(application: ApplicationRow) {
  const startsAt = application.classes?.starts_at;
  if (!startsAt) return Number.MAX_SAFE_INTEGER;

  const date = new Date(startsAt);
  return Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime();
}

function getApplicationActivityTime(application: ApplicationRow) {
  const existingCompletion = getCompletedClasses(application.completed_classes)[0];
  const timestamp =
    existingCompletion?.completed_at ??
    application.updated_at ??
    application.created_at;
  const date = new Date(timestamp);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function sortApplicationsForOperation(applications: ApplicationRow[]) {
  return [...applications].sort((first, second) => {
    const firstIsActive = activeStatuses.has(first.status);
    const secondIsActive = activeStatuses.has(second.status);

    if (firstIsActive && secondIsActive) {
      return getApplicationClassTime(first) - getApplicationClassTime(second);
    }

    if (firstIsActive !== secondIsActive) {
      return firstIsActive ? -1 : 1;
    }

    return getApplicationActivityTime(second) - getApplicationActivityTime(first);
  });
}

function isClassInFuture(application: ApplicationRow) {
  const startsAt = application.classes?.starts_at;
  if (!startsAt) return false;

  const date = new Date(startsAt);
  return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
}

function getNewerActivityAt(
  current: string | null,
  next: string | null,
) {
  if (!current) return next;
  if (!next) return current;

  return new Date(next).getTime() > new Date(current).getTime()
    ? next
    : current;
}

function buildUserOverview(
  applications: ApplicationRow[],
  children: ChildRow[],
  profiles: ProfileRow[],
) {
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const rowsByParentId = new Map<string, UserOverviewRow>();
  const childrenById = new Map<string, ChildOverview>();

  function ensureParentRow(parentId: string, parent?: ProfileRow) {
    const existing = rowsByParentId.get(parentId);
    if (existing) return existing;

    const row: UserOverviewRow = {
      parentId,
      parentName: parent?.full_name ?? '학부모',
      parentPhone: formatPhone(parent?.phone),
      children: [],
      activeApplications: [],
      completedApplications: [],
      noShowApplications: [],
      canceledCount: 0,
      stampCountries: [],
      latestActivityAt: null,
    };

    rowsByParentId.set(parentId, row);
    return row;
  }

  function ensureChildRow(
    parentRow: UserOverviewRow,
    childId: string,
    childName: string,
  ) {
    const existing = childrenById.get(childId);
    if (existing) return existing;

    const childRow: ChildOverview = {
      childId,
      childName,
      activeApplications: [],
      completedApplications: [],
      noShowApplications: [],
      canceledCount: 0,
      stampCountries: [],
      latestActivityAt: null,
    };

    parentRow.children.push(childRow);
    childrenById.set(childId, childRow);
    return childRow;
  }

  children.forEach((child) => {
    const parent = profilesById.get(child.parent_id);
    const parentRow = ensureParentRow(child.parent_id, parent);
    ensureChildRow(parentRow, child.id, child.full_name);
  });

  applications.forEach((application) => {
    const childId = application.child_id ?? application.children?.id;
    const parent = profilesById.get(application.parent_id);
    const parentRow = ensureParentRow(application.parent_id, parent);
    const childRow = childId
      ? ensureChildRow(
          parentRow,
          childId,
          application.children?.full_name ?? '학생',
        )
      : null;

    if (activeStatuses.has(application.status)) {
      parentRow.activeApplications.push(application);
      childRow?.activeApplications.push(application);
    }

    if (application.status === 'completed') {
      parentRow.completedApplications.push(application);
      childRow?.completedApplications.push(application);
    }

    if (application.status === 'no_show') {
      parentRow.noShowApplications.push(application);
      childRow?.noShowApplications.push(application);
    }

    if (application.status === 'canceled') {
      parentRow.canceledCount += 1;
      if (childRow) childRow.canceledCount += 1;
    }

    const completedCountries = application.status === 'completed'
      ? [application.classes?.country]
      : [];
    const nextStampCountries = completedCountries.filter(
      (country): country is string => Boolean(country),
    );

    parentRow.stampCountries = Array.from(
      new Set([...parentRow.stampCountries, ...nextStampCountries]),
    );

    if (childRow) {
      childRow.stampCountries = Array.from(
        new Set([...childRow.stampCountries, ...nextStampCountries]),
      );
    }

    const latestActivityAt = getLatestActivityAt([application]);
    parentRow.latestActivityAt = getNewerActivityAt(
      parentRow.latestActivityAt,
      latestActivityAt,
    );

    if (childRow) {
      childRow.latestActivityAt = getNewerActivityAt(
        childRow.latestActivityAt,
        latestActivityAt,
      );
    }
  });

  return Array.from(rowsByParentId.values()).sort((a, b) => {
    const aTime = a.latestActivityAt ? new Date(a.latestActivityAt).getTime() : 0;
    const bTime = b.latestActivityAt ? new Date(b.latestActivityAt).getTime() : 0;

    return bTime - aTime;
  });
}

function App() {
  const [sessionReady, setSessionReady] = useState(false);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [adminId, setAdminId] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [photoConsentByParentId, setPhotoConsentByParentId] = useState<
    Map<string, boolean>
  >(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<CompletionForm>(initialCompletionForm);
  const [photoPreviews, setPhotoPreviews] = useState<CompletionPhotoPreview[]>([]);
  const [existingPhotoUrls, setExistingPhotoUrls] = useState<Record<string, string>>({});
  const [removedPhotoIds, setRemovedPhotoIds] = useState<Set<string>>(new Set());
  const [classForm, setClassForm] = useState<ClassForm>(initialClassForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancelingClassId, setCancelingClassId] = useState<string | null>(null);
  const [deletingClassId, setDeletingClassId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState<
    'pending' | 'no_show' | 'completed' | 'all'
  >('pending');
  const [view, setView] = useState<AdminView>('dashboard');

  const selectedApplication = useMemo(
    () => applications.find((application) => application.id === selectedId) ?? null,
    [applications, selectedId],
  );
  const selectedApplicationId = selectedApplication?.id ?? null;
  const selectedClassPhotoParticipants = useMemo(
    () =>
      selectedApplication
        ? applications.filter(
            (application) =>
              application.class_id === selectedApplication.class_id &&
              photoParticipantStatuses.has(application.status),
          )
        : [],
    [applications, selectedApplication],
  );
  const selectedClassPhotoMissingConsentCount = useMemo(
    () =>
      selectedClassPhotoParticipants.filter(
        (application) =>
          photoConsentByParentId.get(application.parent_id) !== true,
      ).length,
    [photoConsentByParentId, selectedClassPhotoParticipants],
  );
  const selectedClassAllowsPhotoUpload =
    selectedClassPhotoParticipants.length > 0 &&
    selectedClassPhotoMissingConsentCount === 0;

  const selectedCompletion = useMemo(
    () =>
      selectedApplication
        ? getCompletedClasses(selectedApplication.completed_classes)[0]
        : undefined,
    [selectedApplication],
  );

  const existingPhotos = useMemo(
    () => getCompletedPhotos(selectedCompletion),
    [selectedCompletion],
  );
  const existingPhotoSignature = useMemo(
    () =>
      existingPhotos
        .map((photo) => `${photo.id}:${photo.storage_path}:${photo.sort_order}`)
        .join('|'),
    [existingPhotos],
  );

  const visibleExistingPhotos = useMemo(
    () => existingPhotos.filter((photo) => !removedPhotoIds.has(photo.id)),
    [existingPhotos, removedPhotoIds],
  );

  const profilesById = useMemo(
    () => new Map(profiles.map((item) => [item.id, item])),
    [profiles],
  );

  const overviewRows = useMemo(
    () => buildUserOverview(applications, children, profiles),
    [applications, children, profiles],
  );

  const dashboardStats = useMemo(() => {
    const parentIds = new Set(overviewRows.map((row) => row.parentId));
    const stampCountries = new Set(
      overviewRows.flatMap((row) => row.stampCountries),
    );
    const countedApplications = applications.filter(
      (application) => application.status !== 'canceled',
    );

    return {
      parents: parentIds.size,
      children: children.length,
      totalApplications: countedApplications.length,
      activeApplications: countedApplications.filter((application) =>
        activeStatuses.has(application.status),
      ).length,
      reviewPendingApplications: countedApplications.filter((application) =>
        reviewPendingStatuses.has(application.status),
      ).length,
      confirmedApplications: countedApplications.filter((application) =>
        completionReadyStatuses.has(application.status),
      ).length,
      noShowApplications: countedApplications.filter(
        (application) => application.status === 'no_show',
      ).length,
      completedApplications: countedApplications.filter(
        (application) => application.status === 'completed',
      ).length,
      stampCountries: stampCountries.size,
    };
  }, [applications, overviewRows]);

  const visibleApplications = useMemo(() => {
    const countedApplications = applications.filter(
      (application) => application.status !== 'canceled',
    );

    if (filter === 'all') return sortApplicationsForOperation(countedApplications);

    if (filter === 'no_show') {
      return sortApplicationsForOperation(
        countedApplications.filter(
          (application) => application.status === 'no_show',
        ),
      );
    }

    if (filter === 'completed') {
      return sortApplicationsForOperation(
        countedApplications.filter(
          (application) => application.status === 'completed',
        ),
      );
    }

    return sortApplicationsForOperation(
      countedApplications.filter((application) =>
        completionReadyStatuses.has(application.status),
      ),
    );
  }, [applications, filter]);

  const pendingReviewApplications = useMemo(
    () =>
      sortApplicationsForOperation(
        applications.filter((application) =>
          reviewPendingStatuses.has(application.status),
        ),
      ),
    [applications],
  );

  const getPendingReviewApplicationsForClass = useCallback(
    (classId: string, exceptApplicationId?: string) =>
      applications.filter(
        (application) =>
          application.class_id === classId &&
          application.id !== exceptApplicationId &&
          reviewPendingStatuses.has(application.status),
      ),
    [applications],
  );

  const selectedPendingReviewApplications = useMemo(() => {
    if (!selectedApplication) return [];

    return getPendingReviewApplicationsForClass(
      selectedApplication.class_id,
      selectedApplication.id,
    );
  }, [getPendingReviewApplicationsForClass, selectedApplication]);

  const selectedPendingReviewMessage =
    selectedPendingReviewApplications.length > 0
      ? getPendingReviewBlockMessage(selectedPendingReviewApplications.length)
      : '';

  const hasUnsavedCompletionDraft = useMemo(() => {
    if (!selectedApplication) return false;

    const existingCompletion = getCompletedClasses(
      selectedApplication.completed_classes,
    )[0];
    const baseForm: CompletionForm = {
      completedAt:
        existingCompletion?.completed_at ??
        selectedApplication.classes?.starts_at?.slice(0, 10) ??
        initialCompletionForm.completedAt,
      diary: existingCompletion?.diary ?? '',
      teacherComment: existingCompletion?.teacher_comment ?? '',
    };

    return (
      form.completedAt !== baseForm.completedAt ||
      form.diary !== baseForm.diary ||
      form.teacherComment !== baseForm.teacherComment ||
      photoPreviews.length > 0 ||
      removedPhotoIds.size > 0
    );
  }, [form, photoPreviews.length, removedPhotoIds.size, selectedApplication]);

  const openClasses = useMemo(() => {
    return classes
      .filter((classItem) => classItem.is_open)
      .sort(
        (first, second) =>
          new Date(first.starts_at).getTime() - new Date(second.starts_at).getTime(),
      );
  }, [classes]);

  const closedClasses = useMemo(
    () =>
      classes
        .filter((classItem) => !classItem.is_open)
        .sort(
          (first, second) =>
            new Date(second.starts_at).getTime() -
            new Date(first.starts_at).getTime(),
        ),
    [classes],
  );

  const getClassSummary = useCallback(
    (classId: string) => {
      const classApplications = applications.filter(
        (application) => application.class_id === classId,
      );
      const activeCount = classApplications.filter((application) =>
        activeStatuses.has(application.status),
      ).length;
      const reviewPendingCount = classApplications.filter((application) =>
        reviewPendingStatuses.has(application.status),
      ).length;
      const confirmedCount = classApplications.filter((application) =>
        completionReadyStatuses.has(application.status),
      ).length;
      const completedCount = classApplications.filter(
        (application) => application.status === 'completed',
      ).length;
      const noShowCount = classApplications.filter(
        (application) => application.status === 'no_show',
      ).length;
      const canceledCount = classApplications.filter(
        (application) => application.status === 'canceled',
      ).length;

      return {
        activeCount,
        canceledCount,
        confirmedCount,
        completedCount,
        noShowCount,
        reviewPendingCount,
        totalCount: classApplications.length,
      };
    },
    [applications],
  );

  const getClassStatusText = useCallback(
    (classItem: ClassRow) => {
      const summary = getClassSummary(classItem.id);

      if (summary.reviewPendingCount > 0) {
        return `${summary.reviewPendingCount}명 확인중`;
      }
      if (summary.confirmedCount > 0) return `${summary.confirmedCount}명 신청완료`;
      if (summary.activeCount > 0) return `${summary.activeCount}명 진행중`;
      if (summary.completedCount > 0 || summary.noShowCount > 0) {
        return `처리 완료 ${summary.completedCount + summary.noShowCount}건`;
      }
      if (summary.canceledCount > 0) return `취소 ${summary.canceledCount}건`;
      if (classItem.is_open) return '신청 가능';

      return '닫힘';
    },
    [getClassSummary],
  );

  const loadAdminProfile = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setProfile(null);
      setApplications([]);
      setProfiles([]);
      setChildren([]);
      setClasses([]);
      setPhotoConsentByParentId(new Map());
      setSelectedId(null);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id,role,full_name,phone')
      .eq('id', user.id)
      .single();

    if (error || !data || data.role !== 'admin') {
      await supabase.auth.signOut();
      setProfile(null);
      setApplications([]);
      setProfiles([]);
      setChildren([]);
      setClasses([]);
      setPhotoConsentByParentId(new Map());
      setSelectedId(null);
      setLoginError('운영진 계정만 접속할 수 있어요.');
      return;
    }

    setProfile(data as AdminProfile);
  }, []);

  const loadDashboardData = useCallback(
    async (options: { clearMessage?: boolean; silent?: boolean } = {}) => {
    const shouldShowLoading = !options.silent;
    const shouldShowErrors = !options.silent;

    if (shouldShowLoading) {
      setLoading(true);
    }
    if (options.clearMessage) {
      setMessage('');
    }

    const [
      applicationsResponse,
      profilesResponse,
      childrenResponse,
      classesResponse,
      guardianConsentsResponse,
    ] =
      await Promise.all([
        supabase
          .from('applications')
          .select(
            'id,parent_id,child_id,class_id,status,created_at,updated_at,children(id,full_name),classes(id,title,country,flag,campus,teacher_name,starts_at),completed_classes(id,completed_at,diary,teacher_comment,completed_class_photos(id,completed_class_id,storage_path,file_name,sort_order,created_at))',
          )
          .order('created_at', { ascending: false }),
        supabase.from('profiles').select('id,role,full_name,phone'),
        supabase.from('children').select('id,parent_id,full_name'),
        supabase
          .from('classes')
          .select('id,title,country,flag,campus,teacher_name,starts_at,is_open')
          .order('starts_at', { ascending: true }),
        supabase
          .from('guardian_consent_records')
          .select('id,parent_id,activity_photo_agreed,created_at')
          .eq('privacy_policy_version', currentPrivacyPolicyVersion)
          .eq('terms_version', currentTermsVersion)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }),
      ]);

    if (shouldShowLoading) {
      setLoading(false);
    }

    if (applicationsResponse.error) {
      if (shouldShowErrors) {
        setMessage(
          `신청 목록을 불러오지 못했어요. ${applicationsResponse.error.message}`,
        );
      }
      return;
    }

    if (profilesResponse.error) {
      if (shouldShowErrors) {
        setMessage(
          `사용자 정보를 불러오지 못했어요. ${profilesResponse.error.message}`,
        );
      }
      return;
    }

    if (childrenResponse.error) {
      if (shouldShowErrors) {
        setMessage(
          `학생 정보를 불러오지 못했어요. ${childrenResponse.error.message}`,
        );
      }
      return;
    }

    if (classesResponse.error) {
      if (shouldShowErrors) {
        setMessage(
          `문화교류 목록을 불러오지 못했어요. ${classesResponse.error.message}`,
        );
      }
      return;
    }

    if (guardianConsentsResponse.error) {
      if (shouldShowErrors) {
        setMessage(
          `보호자 사진 동의를 불러오지 못했어요. ${guardianConsentsResponse.error.message}`,
        );
      }
      return;
    }

    const nextApplications = (
      (applicationsResponse.data ?? []) as unknown as ApplicationRow[]
    ).filter((application) => application.classes);

    setApplications(nextApplications);
    setProfiles((profilesResponse.data ?? []) as ProfileRow[]);
    setChildren((childrenResponse.data ?? []) as ChildRow[]);
    setClasses((classesResponse.data ?? []) as ClassRow[]);
    const nextPhotoConsentByParentId = new Map<string, boolean>();

    for (const consent of (guardianConsentsResponse.data ?? []) as GuardianConsentRow[]) {
      if (!nextPhotoConsentByParentId.has(consent.parent_id)) {
        nextPhotoConsentByParentId.set(
          consent.parent_id,
          consent.activity_photo_agreed,
        );
      }
    }

    setPhotoConsentByParentId(nextPhotoConsentByParentId);

    setSelectedId((currentSelectedId) => {
      const selectableApplications = nextApplications.filter(
        (application) => application.status !== 'canceled',
      );

      if (selectableApplications.length === 0) return null;
      if (
        currentSelectedId &&
        selectableApplications.some((row) => row.id === currentSelectedId)
      ) {
        return currentSelectedId;
      }

      const sortedApplications = sortApplicationsForOperation(selectableApplications);
      const firstActive =
        sortedApplications.find((row) => activeStatuses.has(row.status)) ??
        sortedApplications[0];

      return firstActive.id;
    });
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async () => {
      await loadAdminProfile();
      setSessionReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadAdminProfile();
    });

    return () => subscription.unsubscribe();
  }, [loadAdminProfile]);

  useEffect(() => {
    if (profile) {
      loadDashboardData();
    }
  }, [loadDashboardData, profile]);

  useEffect(() => {
    if (!profile) return undefined;

    let refreshTimer: number | undefined;
    const scheduleRefresh = () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }

      refreshTimer = window.setTimeout(() => {
        loadDashboardData({ silent: true });
      }, 250);
    };

    const channel = supabase
      .channel('admin-dashboard-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'applications' },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'completed_classes' },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'completed_class_photos' },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'classes' },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'children' },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'guardian_consent_records' },
        scheduleRefresh,
      )
      .subscribe();

    const handleFocus = () => {
      loadDashboardData({ silent: true });
    };
    window.addEventListener('focus', handleFocus);
    const intervalId = window.setInterval(() => {
      loadDashboardData({ silent: true });
    }, 15000);

    return () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      window.removeEventListener('focus', handleFocus);
      window.clearInterval(intervalId);
      supabase.removeChannel(channel);
    };
  }, [loadDashboardData, profile]);

  useEffect(() => {
    if (!selectedApplication) return;

    const existingCompletion = getCompletedClasses(
      selectedApplication.completed_classes,
    )[0];
    setForm({
      completedAt:
        existingCompletion?.completed_at ??
        selectedApplication.classes?.starts_at?.slice(0, 10) ??
        initialCompletionForm.completedAt,
      diary: existingCompletion?.diary ?? '',
      teacherComment: existingCompletion?.teacher_comment ?? '',
    });
    setPhotoPreviews((current) => {
      current.forEach((preview) => URL.revokeObjectURL(preview.previewUrl));
      return [];
    });
    setRemovedPhotoIds(new Set());
  }, [selectedApplicationId]);

  useEffect(() => {
    if (selectedClassAllowsPhotoUpload) return;

    setPhotoPreviews((current) => {
      current.forEach((preview) => URL.revokeObjectURL(preview.previewUrl));
      return [];
    });
  }, [selectedClassAllowsPhotoUpload]);

  useEffect(() => {
    return () => {
      photoPreviews.forEach((preview) => URL.revokeObjectURL(preview.previewUrl));
    };
  }, [photoPreviews]);

  useEffect(() => {
    let isActive = true;

    if (existingPhotos.length === 0) {
      setExistingPhotoUrls({});
      return () => {
        isActive = false;
      };
    }

    supabase.storage
      .from(completionPhotoBucket)
      .createSignedUrls(
        existingPhotos.map((photo) => photo.storage_path),
        60 * 60,
      )
      .then(({ data, error }) => {
        if (!isActive || error || !data) return;

        const nextUrls = existingPhotos.reduce<Record<string, string>>(
          (urls, photo, index) => {
            const signedUrl = data[index]?.signedUrl;
            if (signedUrl) {
              urls[photo.id] = signedUrl;
            }

            return urls;
          },
          {},
        );

        setExistingPhotoUrls(nextUrls);
      });

    return () => {
      isActive = false;
    };
  }, [existingPhotoSignature]);

  const handleSelectApplication = (applicationId: string) => {
    if (applicationId === selectedId) return;

    if (hasUnsavedCompletionDraft) {
      const shouldLeave = window.confirm(
        '작성 중인 완료문화 내용이 있어요. 저장하지 않고 다른 신청을 볼까요?',
      );

      if (!shouldLeave) return;
    }

    setSelectedId(applicationId);
    setMessage('');
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError('');

    const email = getAdminAuthEmail(adminId);
    if (!email) {
      setLoginError('운영진 아이디 또는 비밀번호를 확인해 주세요.');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setPassword('');
      setLoginError('운영진 아이디 또는 비밀번호를 확인해 주세요.');
      return;
    }

    setAdminId('');
    setPassword('');
    await loadAdminProfile();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setAdminId('');
    setPassword('');
    setLoginError('');
    setApplications([]);
    setProfiles([]);
    setChildren([]);
    setClasses([]);
    setSelectedId(null);
  };

  const handleCreateClass = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    const requiredValues = [
      classForm.title,
      classForm.country,
      classForm.campus,
      classForm.teacherName,
      classForm.startsAt,
      classForm.description,
    ];

    if (requiredValues.some((value) => !value.trim())) {
      setMessage('문화교류명, 나라, 학교, 선생님, 일정, 설명을 모두 입력해 주세요.');
      return;
    }

    const startsAtDate = new Date(classForm.startsAt);
    if (
      Number.isNaN(startsAtDate.getTime()) ||
      startsAtDate.getTime() <= Date.now()
    ) {
      setMessage('문화교류 날짜와 시간은 현재 이후로 입력해 주세요.');
      return;
    }

    const countryOption = getCountryOption(classForm.country);
    setSaving(true);
    setMessage('');

    const { error } = await supabase.from('classes').insert({
      title: classForm.title.trim(),
      country: countryOption.country,
      flag: countryOption.flag,
      campus: classForm.campus.trim(),
      category: '문화',
      teacher_name: classForm.teacherName.trim(),
      target_age: '전체',
      starts_at: new Date(classForm.startsAt).toISOString(),
      location: classForm.campus.trim(),
      seats_total: 6,
      price: 0,
      badge: null,
      image_color: countryOption.imageColor,
      description: classForm.description.trim(),
      is_open: true,
    });

    setSaving(false);

    if (error) {
      setMessage(`문화교류를 개설하지 못했어요. ${error.message}`);
      return;
    }

    setMessage('문화교류가 개설됐어요. 학부모 앱 홈 화면에 반영돼요.');
    setClassForm(initialClassForm);
    await loadDashboardData();
  };

  const handleCancelClass = async (classItem: ClassRow) => {
    if (cancelingClassId || deletingClassId) return;

    const shouldCancel = window.confirm(
      `"${classItem.title}" 문화교류를 취소할까요?\n학부모 앱 홈 화면에서는 더 이상 보이지 않고, 진행 중인 신청은 신청 취소 상태로 바뀝니다.`,
    );

    if (!shouldCancel) return;

    setCancelingClassId(classItem.id);
    setMessage('');

    const { error } = await supabase.rpc('admin_cancel_class', {
      p_class_id: classItem.id,
    });

    setCancelingClassId(null);

    if (error) {
      setMessage(`문화교류를 취소하지 못했어요. ${error.message}`);
      return;
    }

    setMessage('문화교류가 취소됐어요. 학부모 앱 홈 화면에서 내려갑니다.');
    await loadDashboardData();
  };

  const handleApproveApplication = async (application: ApplicationRow) => {
    if (saving) return;

    const shouldApprove = window.confirm(
      `"${application.children?.full_name ?? '학생'}" 학생의 신청을 승인할까요?\n승인하면 학부모 앱에서 신청 완료로 표시됩니다.`,
    );

    if (!shouldApprove) return;

    setSaving(true);
    setMessage('');

    const { error } = await supabase.rpc('admin_confirm_application', {
      p_application_id: application.id,
    });

    setSaving(false);

    if (error) {
      setMessage(`신청을 승인하지 못했어요. ${error.message}`);
      return;
    }

    setMessage('신청을 승인했어요. 학부모 앱에는 신청 완료로 반영됩니다.');
    await loadDashboardData();
  };

  const handleCancelPendingApplication = async (application: ApplicationRow) => {
    if (saving) return;

    const shouldCancel = window.confirm(
      `"${application.children?.full_name ?? '학생'}" 학생의 신청을 취소할까요?\n확인 중인 신청에서 내려가고, 학부모 앱에서도 신청내역에서 사라집니다.`,
    );

    if (!shouldCancel) return;

    setSaving(true);
    setMessage('');

    const { error } = await supabase.rpc('admin_cancel_pending_application', {
      p_application_id: application.id,
    });

    setSaving(false);

    if (error) {
      setMessage(`신청을 취소하지 못했어요. ${error.message}`);
      return;
    }

    setMessage('확인 중인 신청을 취소했어요.');
    await loadDashboardData();
  };

  const handleDeleteClass = async (classItem: ClassRow) => {
    if (cancelingClassId || deletingClassId) return;

    const summary = getClassSummary(classItem.id);
    const shouldDelete = window.confirm(
      `"${classItem.title}" 문화교류 데이터를 완전히 삭제할까요?\n\n연결된 신청 ${summary.totalCount}건, 완료 ${summary.completedCount}건, 미참여 ${summary.noShowCount}건이 함께 삭제됩니다.\n테스트 데이터 정리용 기능이며, 삭제 후 되돌릴 수 없어요.`,
    );

    if (!shouldDelete) return;

    const shouldConfirmAgain = window.confirm(
      '정말 완전 삭제할까요? 실제 학부모 기록이면 삭제하지 말고 취소/수정 기능을 사용해 주세요.',
    );

    if (!shouldConfirmAgain) return;

    if (summary.activeCount > 0) {
      setMessage(
        '진행 중인 신청이 남아 있어요. 먼저 문화교류를 취소하거나 신청을 완료/미참여로 정리한 뒤 삭제해 주세요.',
      );
      return;
    }

    setDeletingClassId(classItem.id);
    setMessage('');

    const { data: linkedApplications, error: linkedApplicationsError } =
      await supabase
        .from('applications')
        .select(
          'id,completed_classes(id,completed_at,diary,teacher_comment,completed_class_photos(id,completed_class_id,storage_path,file_name,sort_order,created_at))',
        )
        .eq('class_id', classItem.id);

    if (linkedApplicationsError) {
      setDeletingClassId(null);
      setMessage(
        `연결된 신청을 확인하지 못했어요. ${linkedApplicationsError.message}`,
      );
      return;
    }

    const photosToDelete = (linkedApplications ?? []).flatMap((application) =>
      getAllCompletedPhotos(
        (application as Pick<ApplicationRow, 'completed_classes'>)
          .completed_classes ?? null,
      ),
    );

    const { error: deleteClassError } = await supabase.rpc('admin_delete_class', {
      p_class_id: classItem.id,
    });

    setDeletingClassId(null);

    if (deleteClassError) {
      setMessage(`문화교류를 삭제하지 못했어요. ${deleteClassError.message}`);
      return;
    }

    if (selectedApplication?.class_id === classItem.id) {
      setSelectedId(null);
    }

    setApplications((currentApplications) =>
      currentApplications.filter(
        (application) => application.class_id !== classItem.id,
      ),
    );
    setClasses((currentClasses) =>
      currentClasses.filter((currentClass) => currentClass.id !== classItem.id),
    );

    const photoDeleteError = await removeCompletionPhotoFiles(photosToDelete);
    if (photoDeleteError) {
      setMessage(
        `문화교류 데이터는 삭제했지만 사진 파일 일부를 정리하지 못했어요. ${photoDeleteError}`,
      );
      await loadDashboardData();
      return;
    }

    setMessage('문화교류와 연결된 테스트 데이터를 완전히 삭제했어요.');
    await loadDashboardData();
  };

  const syncClassOpenStateAfterFinalization = async (classId: string) => {
    const { count, error: countError } = await supabase
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', classId)
      .in('status', ['applied', 'waiting', 'confirmed']);

    if (countError) {
      return countError.message;
    }

    const openStateResponse = await supabase
      .from('classes')
      .update({
        is_open: (count ?? 0) > 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', classId);

    return openStateResponse.error?.message ?? null;
  };

  const handleMarkNoShow = async () => {
    if (!selectedApplication) return;
    if (saving) return;

    if (
      selectedApplication.status === 'applied' ||
      selectedApplication.status === 'waiting'
    ) {
      setMessage('신청 확인 탭에서 먼저 승인한 뒤 미참여 처리해 주세요.');
      return;
    }

    const pendingReviewApplicationsForClass =
      getPendingReviewApplicationsForClass(
        selectedApplication.class_id,
        selectedApplication.id,
      );

    if (pendingReviewApplicationsForClass.length > 0) {
      const pendingReviewMessage = getPendingReviewBlockMessage(
        pendingReviewApplicationsForClass.length,
      );

      setMessage(pendingReviewMessage);
      window.alert(pendingReviewMessage);
      return;
    }

    if (isClassInFuture(selectedApplication)) {
      const shouldContinue = window.confirm(
        `"${selectedApplication.classes?.title ?? '문화교류'}"은 아직 진행 시간이 지나지 않았어요.\n테스트가 아니라면 문화교류 후에 미참여 처리하는 게 안전합니다. 그래도 계속할까요?`,
      );

      if (!shouldContinue) return;
    }

    const shouldMarkNoShow = window.confirm(
      `"${selectedApplication.children?.full_name ?? '학생'}" 학생을 미참여로 처리할까요?`,
    );

    if (!shouldMarkNoShow) return;

    setSaving(true);
    setMessage('');

    const existingCompletion = getCompletedClasses(
      selectedApplication.completed_classes,
    )[0];

    if (existingCompletion) {
      const photoDeleteError = await deleteCompletionPhotos(
        getCompletedPhotos(existingCompletion),
      );

      if (photoDeleteError) {
        setSaving(false);
        setMessage(`사진 파일을 정리하지 못했어요. ${photoDeleteError}`);
        return;
      }

      const deleteResponse = await supabase
        .from('completed_classes')
        .delete()
        .eq('id', existingCompletion.id);

      if (deleteResponse.error) {
        setSaving(false);
        setMessage(`완료문화 기록을 정리하지 못했어요. ${deleteResponse.error.message}`);
        return;
      }
    }

    const applicationResponse = await supabase
      .from('applications')
      .update({ status: 'no_show', updated_at: new Date().toISOString() })
      .eq('id', selectedApplication.id);

    if (applicationResponse.error) {
      setSaving(false);
      setMessage(`미참여 처리에 실패했어요. ${applicationResponse.error.message}`);
      return;
    }

    if (selectedApplication.class_id) {
      const classOpenStateError = await syncClassOpenStateAfterFinalization(
        selectedApplication.class_id,
      );

      if (classOpenStateError) {
        setSaving(false);
        setMessage(
          `미참여 처리는 됐지만 문화교류 마감 상태를 확인하지 못했어요. ${classOpenStateError}`,
        );
        await loadDashboardData();
        return;
      }
    }

    setSaving(false);
    setMessage('미참여로 처리했어요. 완료문화와 스탬프에는 반영되지 않아요.');
    await loadDashboardData();
  };

  const handleMarkPending = async () => {
    if (!selectedApplication) return;
    if (saving) return;

    if (!finalizedStatuses.has(selectedApplication.status)) {
      setMessage('완료문화 또는 미참여 상태만 신청완료로 되돌릴 수 있어요.');
      return;
    }

    const shouldMarkPending = window.confirm(
      `"${selectedApplication.children?.full_name ?? '학생'}" 학생의 신청을 신청완료 상태로 되돌릴까요?`,
    );

    if (!shouldMarkPending) return;

    setSaving(true);
    setMessage('');

    const existingCompletion = getCompletedClasses(
      selectedApplication.completed_classes,
    )[0];

    if (existingCompletion) {
      const photoDeleteError = await deleteCompletionPhotos(
        getCompletedPhotos(existingCompletion),
      );

      if (photoDeleteError) {
        setSaving(false);
        setMessage(`사진 파일을 정리하지 못했어요. ${photoDeleteError}`);
        return;
      }

      const deleteResponse = await supabase
        .from('completed_classes')
        .delete()
        .eq('id', existingCompletion.id);

      if (deleteResponse.error) {
        setSaving(false);
        setMessage(`완료문화 기록을 정리하지 못했어요. ${deleteResponse.error.message}`);
        return;
      }
    }

    const applicationResponse = await supabase
      .from('applications')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('id', selectedApplication.id);

    if (applicationResponse.error) {
      setSaving(false);
      setMessage(`신청완료로 되돌리지 못했어요. ${applicationResponse.error.message}`);
      return;
    }

    if (selectedApplication.class_id) {
      const classOpenStateError = await syncClassOpenStateAfterFinalization(
        selectedApplication.class_id,
      );

      if (classOpenStateError) {
        setSaving(false);
        setMessage(
          `신청완료로 되돌렸지만 문화교류 신청 가능 상태를 맞추지 못했어요. ${classOpenStateError}`,
        );
        await loadDashboardData();
        return;
      }
    }

    setSaving(false);
    setMessage('신청완료 상태로 되돌렸어요.');
    await loadDashboardData();
  };

  const handlePhotoFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (!selectedFiles.length) return;

    if (!selectedClassAllowsPhotoUpload) {
      setMessage(
        selectedClassPhotoMissingConsentCount > 0
          ? `같은 문화교류 참석자 중 사진 미동의 또는 미확인 ${selectedClassPhotoMissingConsentCount}명이 있어 사진을 올릴 수 없어요.`
          : '사진을 올릴 수 있는 참석자가 없어요.',
      );
      return;
    }

    const invalidFile = selectedFiles.find(
      (file) =>
        !isAllowedCompletionPhoto(file) ||
        file.size > maxCompletionPhotoSize,
    );

    if (invalidFile) {
      setMessage('사진은 JPG, PNG, WEBP 형식으로 5MB 이하만 올릴 수 있어요.');
      return;
    }

    const availableCount =
      maxCompletionPhotoCount - visibleExistingPhotos.length - photoPreviews.length;

    if (availableCount <= 0) {
      setMessage(`사진은 최대 ${maxCompletionPhotoCount}장까지 올릴 수 있어요.`);
      return;
    }

    const nextFiles = selectedFiles.slice(0, availableCount);
    const nextPreviews = nextFiles.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    if (selectedFiles.length > availableCount) {
      setMessage(`사진은 최대 ${maxCompletionPhotoCount}장까지 올릴 수 있어요.`);
    } else {
      setMessage('');
    }

    setPhotoPreviews((current) => [...current, ...nextPreviews]);
  };

  const handleRemovePendingPhoto = (previewUrl: string) => {
    setPhotoPreviews((current) => {
      const target = current.find((preview) => preview.previewUrl === previewUrl);
      if (target) URL.revokeObjectURL(target.previewUrl);

      return current.filter((preview) => preview.previewUrl !== previewUrl);
    });
  };

  const handleRemoveExistingPhoto = (photoId: string) => {
    setRemovedPhotoIds((current) => {
      const next = new Set(current);
      next.add(photoId);
      return next;
    });
  };

  const handleRestoreExistingPhoto = (photoId: string) => {
    setRemovedPhotoIds((current) => {
      const next = new Set(current);
      next.delete(photoId);
      return next;
    });
  };

  const removeCompletionPhotoFiles = async (photos: CompletedClassPhotoRow[]) => {
    if (!photos.length) return null;

    const storagePaths = photos.map((photo) => photo.storage_path);
    const { error: storageError } = await supabase.storage
      .from(completionPhotoBucket)
      .remove(storagePaths);

    return storageError?.message ?? null;
  };

  const deleteCompletionPhotos = async (photos: CompletedClassPhotoRow[]) => {
    if (!photos.length) return null;

    const { error: tableError } = await supabase
      .from('completed_class_photos')
      .delete()
      .in(
        'id',
        photos.map((photo) => photo.id),
      );

    if (tableError) return tableError.message;

    return removeCompletionPhotoFiles(photos);
  };

  const uploadCompletionPhotos = async (
    completedClassId: string,
    files: File[],
    startOrder: number,
  ) => {
    if (!files.length) return null;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const rows: {
      completed_class_id: string;
      storage_path: string;
      file_name: string;
      sort_order: number;
      created_by: string | null;
    }[] = [];
    const uploadedPaths: string[] = [];

    for (const [index, file] of files.entries()) {
      const storagePath = createCompletionPhotoPath(completedClassId, file);
      const { error: uploadError } = await supabase.storage
        .from(completionPhotoBucket)
        .upload(storagePath, file, {
          contentType: getCompletionPhotoContentType(file),
          upsert: false,
        });

      if (uploadError) {
        if (uploadedPaths.length > 0) {
          await supabase.storage.from(completionPhotoBucket).remove(uploadedPaths);
        }

        return uploadError.message;
      }

      uploadedPaths.push(storagePath);
      rows.push({
        completed_class_id: completedClassId,
        storage_path: storagePath,
        file_name: file.name,
        sort_order: startOrder + index,
        created_by: user?.id ?? null,
      });
    }

    const { error: insertError } = await supabase
      .from('completed_class_photos')
      .insert(rows);

    if (insertError) {
      await supabase.storage.from(completionPhotoBucket).remove(uploadedPaths);
    }

    return insertError?.message ?? null;
  };

  const handleComplete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedApplication) return;
    if (saving) return;

    if (
      selectedApplication.status === 'applied' ||
      selectedApplication.status === 'waiting'
    ) {
      setMessage('신청 확인 탭에서 먼저 승인한 뒤 완료문화로 등록해 주세요.');
      return;
    }

    const pendingReviewApplicationsForClass =
      getPendingReviewApplicationsForClass(
        selectedApplication.class_id,
        selectedApplication.id,
      );

    if (pendingReviewApplicationsForClass.length > 0) {
      const pendingReviewMessage = getPendingReviewBlockMessage(
        pendingReviewApplicationsForClass.length,
      );

      setMessage(pendingReviewMessage);
      window.alert(pendingReviewMessage);
      return;
    }

    if (visibleExistingPhotos.length + photoPreviews.length > maxCompletionPhotoCount) {
      setMessage(`사진은 최대 ${maxCompletionPhotoCount}장까지 올릴 수 있어요.`);
      return;
    }

    if (photoPreviews.length > 0 && !selectedClassAllowsPhotoUpload) {
      setMessage(
        `같은 문화교류 참석자 중 사진 미동의 또는 미확인 ${selectedClassPhotoMissingConsentCount}명이 있어 사진을 올릴 수 없어요.`,
      );
      return;
    }

    if (!form.diary.trim() || !form.teacherComment.trim()) {
      window.alert('문화 일지와 선생님 코멘트를 입력해 주세요.');
      return;
    }

    const shouldSaveCompletion = window.confirm(
      '완료문화로 저장할까요?\n저장하면 학부모 앱의 완료문화와 스탬프 화면에 반영됩니다.',
    );

    if (!shouldSaveCompletion) return;

    const existingCompletion = getCompletedClasses(
      selectedApplication.completed_classes,
    )[0];
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setSaving(true);
    setMessage('');

    const payload = {
      application_id: selectedApplication.id,
      completed_at: form.completedAt,
      diary: form.diary.trim(),
      teacher_comment: form.teacherComment.trim(),
      updated_at: new Date().toISOString(),
    };

    const response = existingCompletion
      ? await supabase
          .from('completed_classes')
          .update(payload)
          .eq('id', existingCompletion.id)
          .select('id')
          .single()
      : await supabase.from('completed_classes').insert({
          ...payload,
          created_by: user?.id ?? null,
        })
          .select('id')
          .single();

    if (response.error) {
      setSaving(false);
      setMessage(`저장하지 못했어요. ${response.error.message}`);
      return;
    }

    const completedClassId = response.data.id as string;
    const photosToDelete = existingPhotos.filter((photo) =>
      removedPhotoIds.has(photo.id),
    );

    const deletePhotoError = await deleteCompletionPhotos(photosToDelete);
    if (deletePhotoError) {
      setSaving(false);
      setMessage(`사진을 삭제하지 못했어요. ${deletePhotoError}`);
      await loadDashboardData();
      return;
    }

    const uploadPhotoError = await uploadCompletionPhotos(
      completedClassId,
      photoPreviews.map((preview) => preview.file),
      visibleExistingPhotos.length,
    );

    if (uploadPhotoError) {
      setSaving(false);
      setMessage(`완료문화는 저장됐지만 사진을 올리지 못했어요. ${uploadPhotoError}`);
      await loadDashboardData();
      return;
    }

    const applicationResponse = await supabase
      .from('applications')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', selectedApplication.id);

    if (applicationResponse.error) {
      setSaving(false);
      setMessage(
        `완료문화는 저장됐지만 신청 상태를 바꾸지 못했어요. ${applicationResponse.error.message}`,
      );
      return;
    }

    if (selectedApplication.class_id) {
      const classOpenStateError = await syncClassOpenStateAfterFinalization(
        selectedApplication.class_id,
      );

      if (classOpenStateError) {
        setSaving(false);
        setMessage(
          `완료문화는 저장됐지만 문화교류 마감 상태를 확인하지 못했어요. ${classOpenStateError}`,
        );
        await loadDashboardData();
        return;
      }
    }

    setSaving(false);
    setPhotoPreviews((current) => {
      current.forEach((preview) => URL.revokeObjectURL(preview.previewUrl));
      return [];
    });
    setRemovedPhotoIds(new Set());
    setMessage('완료문화가 저장됐어요. 학부모 앱의 완료와 스탬프에 반영돼요.');
    await loadDashboardData();
  };

  if (!sessionReady) {
    return (
      <main className="center-page">
        <p>준비 중이에요.</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="login-page">
        <section className="login-panel">
          <p className="eyebrow">Globee 운영진</p>
          <h1>관리자 로그인</h1>
          <p className="login-copy">
            앱 사용자 현황과 완료문화 등록을 관리해 주세요.
          </p>

          <form
            autoComplete="off"
            className="login-form"
            onSubmit={handleLogin}
          >
            <label>
              운영진 아이디
              <input
                autoComplete="off"
                name="globee-admin-id"
                value={adminId}
                onChange={(event) => setAdminId(event.target.value)}
                placeholder="아이디"
              />
            </label>
            <label>
              비밀번호
              <input
                autoComplete="new-password"
                name="globee-admin-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="비밀번호"
                type="password"
              />
            </label>
            {loginError && <p className="error-text">{loginError}</p>}
            <button type="submit" disabled={loading}>
              {loading ? '확인 중' : '로그인'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="top-bar">
        <div>
          <p className="eyebrow">Globee 운영진</p>
          <h1>앱 관리 대시보드</h1>
        </div>
        <div className="top-actions">
          <button
            className="secondary-button"
            onClick={() => loadDashboardData({ clearMessage: true })}
          >
            새로고침
          </button>
          <button className="ghost-button" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      </header>

      <nav className="view-tabs" aria-label="관리 화면">
        <button
          className={view === 'dashboard' ? 'active' : ''}
          onClick={() => setView('dashboard')}
        >
          전체 현황
        </button>
        <button
          className={view === 'applicationReview' ? 'active' : ''}
          onClick={() => setView('applicationReview')}
        >
          신청 확인
          {pendingReviewApplications.length > 0 ? (
            <span className="tab-count">{pendingReviewApplications.length}</span>
          ) : null}
        </button>
        <button
          className={view === 'completion' ? 'active' : ''}
          onClick={() => setView('completion')}
        >
          완료문화 등록
        </button>
        <button
          className={view === 'classes' ? 'active' : ''}
          onClick={() => setView('classes')}
        >
          문화교류 개설
        </button>
        <button
          className={view === 'deleteClasses' ? 'active' : ''}
          onClick={() => setView('deleteClasses')}
        >
          문화교류 삭제
        </button>
      </nav>

      {message && <p className="message-text global-message">{message}</p>}

      {view === 'dashboard' ? (
        <>
          <section className="summary-strip dashboard-summary">
            <div className="summary-card standalone">
              <span>{dashboardStats.parents}</span>
              앱 사용자
            </div>
            <div className="summary-flow">
              <div>
                <span>{dashboardStats.totalApplications}</span>
                전체 신청
              </div>
              <div>
                <span>{dashboardStats.reviewPendingApplications}</span>
                신청 확인
              </div>
              <div>
                <span>{dashboardStats.confirmedApplications}</span>
                신청 완료
              </div>
              <div>
                <span>{dashboardStats.noShowApplications}</span>
                미참여
              </div>
              <div>
                <span>{dashboardStats.completedApplications}</span>
                완료문화
              </div>
            </div>
            <div className="summary-card standalone">
              <span>{dashboardStats.stampCountries}</span>
              경험 나라
            </div>
          </section>

          <section className="dashboard-grid">
            <div className="overview-panel wide-panel">
              <div className="list-header">
                <div>
                  <h2>사용자별 현황</h2>
                  <p>전화번호 하나를 기준으로 학생과 문화교류 현황을 한 번에 봅니다.</p>
                </div>
              </div>

              <div className="overview-table">
                <div className="overview-row header-row">
                  <span>학부모</span>
                  <span>등록 학생</span>
                  <span>신청 현황</span>
                  <span>문화교류 결과</span>
                  <span>스탬프</span>
                </div>

                {overviewRows.map((row) => (
                  <div className="overview-row" key={row.parentId}>
                    <div className="parent-cell">
                      <strong>{row.parentPhone}</strong>
                      <small>{row.parentName}</small>
                    </div>
                    <div className="child-detail-grid">
                      {row.children.map((child) => (
                        <div className="child-detail-row" key={child.childId}>
                          <div>
                            <strong>{child.childName}</strong>
                            <small>등록 학생</small>
                          </div>
                          <div>
                            <strong>{child.activeApplications.length}건</strong>
                            <small>
                              {getApplicationTitlePreview(
                                child.activeApplications,
                                '진행 중인 신청 없음',
                              )}
                            </small>
                          </div>
                          <div>
                            <strong>
                              미참여 {child.noShowApplications.length}건 · 완료{' '}
                              {child.completedApplications.length}건
                            </strong>
                            <small>
                              {getApplicationTitlePreview(
                                [
                                  ...child.noShowApplications,
                                  ...child.completedApplications,
                                ],
                                '아직 처리된 문화교류 없음',
                              )}
                            </small>
                          </div>
                          <div>
                            <strong>{child.stampCountries.length}개</strong>
                            <small>
                              {child.stampCountries.join(', ') || '아직 없음'}
                            </small>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {!loading && overviewRows.length === 0 && (
                  <p className="empty-text">아직 등록된 학생이 없어요.</p>
                )}
              </div>
            </div>
          </section>
        </>
      ) : view === 'applicationReview' ? (
        <>
          <section className="summary-strip review-summary">
            <div>
              <span>{pendingReviewApplications.length}</span>
              확인 대기
            </div>
            <div>
              <span>{dashboardStats.confirmedApplications}</span>
              신청 완료
            </div>
            <div>
              <span>{dashboardStats.activeApplications}</span>
              진행 중 전체
            </div>
          </section>

          <section className="review-workspace">
            <div className="application-list review-list-panel">
              <div className="list-header">
                <div>
                  <h2>신청 확인</h2>
                  <p>
                    학부모가 신청한 내용을 확인한 뒤 신청완료로 승인해 주세요.
                  </p>
                </div>
              </div>

              {loading && <p className="muted">불러오는 중이에요.</p>}

              <div className="review-card-list">
                {pendingReviewApplications.map((application) => {
                  const parent = profilesById.get(application.parent_id);

                  return (
                    <article className="review-card" key={application.id}>
                      <div className="flag-box">
                        {application.classes?.flag ?? '🌐'}
                      </div>
                      <div className="review-card-main">
                        <div>
                          <strong>
                            {application.classes?.title ?? '문화교류 정보 없음'}
                          </strong>
                          <span>
                            {application.classes?.country ?? '나라 정보 없음'} ·{' '}
                            {application.classes?.campus ?? '학교 정보 없음'} ·{' '}
                            {formatDateTime(application.classes?.starts_at ?? null)}
                          </span>
                        </div>
                        <div className="review-meta-grid">
                          <div>
                            <small>학부모</small>
                            <b>{formatPhone(parent?.phone)}</b>
                          </div>
                          <div>
                            <small>학생</small>
                            <b>{application.children?.full_name ?? '학생 정보 없음'}</b>
                          </div>
                          <div>
                            <small>신청 시간</small>
                            <b>{formatDateTime(application.created_at)}</b>
                          </div>
                        </div>
                      </div>
                      <div className="review-actions">
                        <span className={`status-badge ${application.status}`}>
                          {statusLabels[application.status]}
                        </span>
                        <button
                          className="approve-small-button"
                          disabled={saving}
                          onClick={() => handleApproveApplication(application)}
                          type="button"
                        >
                          신청 승인
                        </button>
                        <button
                          className="danger-small-button"
                          disabled={saving}
                          onClick={() => handleCancelPendingApplication(application)}
                          type="button"
                        >
                          신청 취소
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              {!loading && pendingReviewApplications.length === 0 && (
                <p className="empty-text">확인할 신청이 없어요.</p>
              )}
            </div>
          </section>
        </>
      ) : view === 'completion' ? (
        <>
          <section className="summary-strip completion-summary">
            <div>
              <span>{dashboardStats.totalApplications}</span>
              전체 신청
            </div>
            <div>
              <span>{dashboardStats.reviewPendingApplications}</span>
              신청 확인
            </div>
            <div>
              <span>{dashboardStats.confirmedApplications}</span>
              완료 등록 대기
            </div>
            <div>
              <span>{dashboardStats.noShowApplications}</span>
              미참여
            </div>
            <div>
              <span>{dashboardStats.completedApplications}</span>
              완료문화
            </div>
          </section>

          <section className="workspace">
            <div className="application-list">
              <div className="list-header">
                <div>
                  <h2>신청 목록</h2>
                  <p>완료문화로 등록할 신청을 선택해 주세요.</p>
                </div>
                <select
                  value={filter}
                  onChange={(event) =>
                    setFilter(
                      event.target.value as
                        | 'pending'
                        | 'no_show'
                        | 'completed'
                        | 'all',
                    )
                  }
                >
                  <option value="pending">완료 등록 대기</option>
                  <option value="no_show">미참여</option>
                  <option value="completed">완료문화</option>
                  <option value="all">전체</option>
                </select>
              </div>

              {loading && <p className="muted">불러오는 중이에요.</p>}

              <div className="list-items">
                {visibleApplications.map((application) => (
                  <button
                    className={`application-item ${
                      application.id === selectedId ? 'selected' : ''
                    }`}
                    key={application.id}
                    onClick={() => handleSelectApplication(application.id)}
                  >
                    <div className="flag-box">
                      {application.classes?.flag ?? '🌐'}
                    </div>
                    <div className="application-main">
                      <strong>
                        {application.classes?.title ?? '문화교류 정보 없음'}
                      </strong>
                      <span>
                        {application.children?.full_name ?? '학생 정보 없음'} ·{' '}
                        {application.classes?.country ?? '나라 정보 없음'} ·{' '}
                        {application.classes?.teacher_name ?? '선생님'}
                      </span>
                      <small>신청 {formatDateTime(application.created_at)}</small>
                    </div>
                    <span className={`status-badge ${application.status}`}>
                      {statusLabels[application.status]}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="completion-panel">
              {selectedApplication ? (
                <>
                  <div className="completion-heading">
                    <div>
                      <p className="eyebrow">
                        {selectedApplication.classes?.country ?? '문화교류'}
                      </p>
                      <h2>{getCompletionTitle(selectedApplication)}</h2>
                    </div>
                    <span className={`status-badge ${selectedApplication.status}`}>
                      {statusLabels[selectedApplication.status]}
                    </span>
                  </div>

                  <div className="detail-grid">
                    <div>
                      <span>학생</span>
                      {selectedApplication.children?.full_name ?? '-'}
                    </div>
                    <div>
                      <span>문화교류</span>
                      {selectedApplication.classes?.title ?? '-'}
                    </div>
                    <div>
                      <span>선생님</span>
                      {selectedApplication.classes?.teacher_name ?? '-'}
                    </div>
                    <div>
                      <span>진행일</span>
                      {formatDateTime(selectedApplication.classes?.starts_at ?? null)}
                    </div>
                  </div>

                  <form className="completion-form" onSubmit={handleComplete}>
                    <label>
                      완료 날짜
                      <input
                        type="date"
                        value={form.completedAt}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            completedAt: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      문화 일지
                      <textarea
                        value={form.diary}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            diary: event.target.value,
                          }))
                        }
                        placeholder="아이가 문화교류에서 경험한 내용을 적어 주세요."
                      />
                    </label>
                    <label>
                      {selectedApplication.classes?.teacher_name ?? '선생님'} 선생님
                      코멘트
                      <textarea
                        value={form.teacherComment}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            teacherComment: event.target.value,
                          }))
                        }
                        placeholder="참여 태도와 인상 깊었던 순간을 적어 주세요."
                      />
                    </label>

                    <div className="photo-upload-panel">
                      <label>
                        활동 사진
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          multiple
                          disabled={
                            saving ||
                            !selectedClassAllowsPhotoUpload ||
                            visibleExistingPhotos.length + photoPreviews.length >=
                              maxCompletionPhotoCount
                          }
                          onChange={handlePhotoFileChange}
                        />
                      </label>
                      <p>
                        {selectedClassAllowsPhotoUpload
                          ? `JPG, PNG, WEBP 형식으로 최대 ${maxCompletionPhotoCount}장, 한 장당 5MB까지 올릴 수 있어요.`
                          : selectedClassPhotoMissingConsentCount > 0
                            ? `같은 문화교류 참석자 중 사진 미동의 또는 미확인 ${selectedClassPhotoMissingConsentCount}명이 있어 수업 사진을 업로드할 수 없어요.`
                            : '사진을 올릴 수 있는 참석자가 없어요.'}
                      </p>

                      {existingPhotos.length > 0 || photoPreviews.length > 0 ? (
                        <div className="photo-preview-grid">
                          {existingPhotos.map((photo) => {
                            const isRemoved = removedPhotoIds.has(photo.id);

                            return (
                              <div
                                className={`photo-preview-card ${
                                  isRemoved ? 'removed' : ''
                                }`}
                                key={photo.id}
                              >
                                {existingPhotoUrls[photo.id] ? (
                                  <img
                                    alt="저장된 활동 사진 미리보기"
                                    src={existingPhotoUrls[photo.id]}
                                  />
                                ) : (
                                  <div className="photo-preview-placeholder">
                                    저장된 사진
                                  </div>
                                )}
                                <span>{photo.file_name}</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    isRemoved
                                      ? handleRestoreExistingPhoto(photo.id)
                                      : handleRemoveExistingPhoto(photo.id)
                                  }
                                >
                                  {isRemoved ? '삭제 취소' : '삭제'}
                                </button>
                              </div>
                            );
                          })}

                          {photoPreviews.map((preview) => (
                            <div
                              className="photo-preview-card"
                              key={preview.previewUrl}
                            >
                              <img
                                alt="선택한 활동 사진 미리보기"
                                src={preview.previewUrl}
                              />
                              <span>{preview.file.name}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemovePendingPhoto(preview.previewUrl)
                                }
                              >
                                삭제
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {selectedPendingReviewMessage ? (
                      <div className="completion-blocking-notice" role="alert">
                        <strong>먼저 신청 확인을 완료해 주세요.</strong>
                        <p>{selectedPendingReviewMessage}</p>
                        <p>
                          남은 신청:{' '}
                          {selectedPendingReviewApplications
                            .map(
                              (application) =>
                                application.children?.full_name ?? '이름 없음',
                            )
                            .join(', ')}
                        </p>
                      </div>
                    ) : null}

                    <div className="completion-actions">
                      <button
                        className="ghost-action-button"
                        disabled={
                          saving || !finalizedStatuses.has(selectedApplication.status)
                        }
                        onClick={handleMarkPending}
                        type="button"
                      >
                        신청완료로 되돌리기
                      </button>
                      <button
                        className="secondary-danger-button"
                        disabled={
                          saving ||
                          selectedApplication.status === 'no_show' ||
                          selectedApplication.status === 'applied' ||
                          selectedApplication.status === 'waiting' ||
                          selectedApplication.status === 'canceled'
                        }
                        onClick={handleMarkNoShow}
                        type="button"
                      >
                        {selectedApplication.status === 'completed'
                          ? '미참여로 변경'
                          : '미참여 처리'}
                      </button>
                      <button
                        className="primary-button"
                        type="submit"
                        disabled={
                          saving ||
                          selectedApplication.status === 'canceled' ||
                          selectedApplication.status === 'applied' ||
                          selectedApplication.status === 'waiting'
                        }
                      >
                        {saving
                          ? '저장 중'
                          : getCompletedClasses(selectedApplication.completed_classes)
                              .length
                              ? '완료문화 수정하기'
                            : '완료문화 등록하기'}
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <p className="empty-text">선택할 신청이 아직 없어요.</p>
              )}
            </div>
          </section>
        </>
      ) : view === 'classes' ? (
        <>
          <section className="class-management">
            <div className="class-create-panel">
              <div className="list-header">
                <div>
                  <h2>문화교류 개설</h2>
                  <p>
                    학교는 강북권 4개 대학교 중에서 선택해 주세요.
                  </p>
                </div>
              </div>

              <form className="class-form" onSubmit={handleCreateClass}>
                <label>
                  문화교류명
                  <input
                    value={classForm.title}
                    onChange={(event) =>
                      setClassForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    placeholder="ex) 베트남 시장과 음식 문화"
                  />
                </label>

                <label>
                  문화교류 설명
                  <textarea
                    value={classForm.description}
                    onChange={(event) =>
                      setClassForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    placeholder="아이들이 어떤 문화 경험을 하게 되는지 적어 주세요."
                  />
                </label>

                <div className="form-grid">
                  <label>
                    나라
                    <select
                      value={classForm.country}
                      onChange={(event) =>
                        setClassForm((current) => ({
                          ...current,
                          country: event.target.value,
                        }))
                      }
                    >
                      {stampCountryOptions.map((option) => (
                        <option key={option.country} value={option.country}>
                          {option.flag} {option.country}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div
                    className="country-preview"
                    style={{
                      backgroundColor: getCountryOption(classForm.country).imageColor,
                    }}
                  >
                    <span>{getCountryOption(classForm.country).flag}</span>
                    <strong>{getCountryOption(classForm.country).country}</strong>
                    <small>국기와 카드 색상은 자동 적용</small>
                  </div>
                </div>

                <div className="form-grid">
                  <label>
                    선생님 이름
                    <input
                      value={classForm.teacherName}
                      onChange={(event) =>
                        setClassForm((current) => ({
                          ...current,
                          teacherName: event.target.value,
                        }))
                      }
                      placeholder="Linh"
                    />
                  </label>
                  <label>
                    문화교류 날짜와 시간
                    <input
                      type="datetime-local"
                      value={classForm.startsAt}
                      onChange={(event) =>
                        setClassForm((current) => ({
                          ...current,
                          startsAt: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>

                <label>
                  대학교명
                  <select
                    value={classForm.campus}
                    onChange={(event) =>
                      setClassForm((current) => ({
                        ...current,
                        campus: event.target.value,
                      }))
                    }
                  >
                    {campusOptions.map((campus) => (
                      <option key={campus} value={campus}>
                        {campus}
                      </option>
                    ))}
                  </select>
                </label>

                <button className="primary-button" disabled={saving} type="submit">
                  {saving ? '개설 중' : '문화교류 개설하기'}
                </button>
              </form>
            </div>

            <div className="open-class-panel">
              <h2>개설된 문화교류</h2>
              <p className="panel-copy">
                신청을 닫아야 하는 문화교류만 취소해 주세요. 테스트 데이터 삭제는
                별도 메뉴에서 진행합니다.
              </p>
              <div className="open-class-list">
                {openClasses.map((classItem) => (
                  <div className="open-class-item" key={classItem.id}>
                    <div className="flag-box">{classItem.flag}</div>
                    <div>
                      <strong>{classItem.title}</strong>
                      <span>
                        {classItem.campus} · {classItem.country} · 선생님{' '}
                        {classItem.teacher_name}
                      </span>
                      <small>
                        {formatDateTime(classItem.starts_at)} ·{' '}
                        {getClassStatusText(classItem)}
                      </small>
                    </div>
                    <div className="class-actions">
                      <button
                        className="danger-small-button"
                        disabled={cancelingClassId === classItem.id}
                        onClick={() => handleCancelClass(classItem)}
                        type="button"
                      >
                        {cancelingClassId === classItem.id ? '처리 중' : '문화교류 취소'}
                      </button>
                    </div>
                  </div>
                ))}

                {openClasses.length === 0 && (
                  <p className="empty-text">현재 개설된 문화교류가 없어요.</p>
                )}
              </div>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="class-delete-management">
            <div className="class-delete-panel">
              <div className="list-header">
                <div>
                  <h2>문화교류 삭제</h2>
                  <p>
                    테스트로 만들었거나 잘못 생성한 문화교류만 완전히 삭제해 주세요.
                    실제 운영 기록은 삭제하지 않는 게 안전합니다.
                  </p>
                </div>
              </div>

              <div className="delete-warning">
                삭제하면 연결된 신청, 완료문화, 미참여 기록이 함께 사라지고
                되돌릴 수 없어요. 운영 중인 문화교류는 먼저 문화교류 개설에서
                취소한 뒤 삭제해 주세요.
              </div>

              <div className="open-class-list delete-class-list">
                {closedClasses.map((classItem) => (
                  <div className="open-class-item" key={classItem.id}>
                    <div className="flag-box">{classItem.flag}</div>
                    <div>
                      <strong>{classItem.title}</strong>
                      <span>
                        {classItem.campus} · {classItem.country} · 선생님{' '}
                        {classItem.teacher_name}
                      </span>
                      <small>
                        {formatDateTime(classItem.starts_at)} ·{' '}
                        {getClassStatusText(classItem)}
                      </small>
                    </div>
                    <div className="class-actions">
                      <button
                        className="delete-small-button"
                        disabled={deletingClassId === classItem.id}
                        onClick={() => handleDeleteClass(classItem)}
                        type="button"
                      >
                        {deletingClassId === classItem.id ? '삭제 중' : '완전 삭제'}
                      </button>
                    </div>
                  </div>
                ))}

                {closedClasses.length === 0 && (
                  <p className="empty-text">삭제할 문화교류가 없어요.</p>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

export default App;
