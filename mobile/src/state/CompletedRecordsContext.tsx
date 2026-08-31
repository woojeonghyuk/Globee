import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ClassItem,
  StampProgressItem,
  stampItems,
} from '@/src/data/classes';
import { supabase } from '@/src/lib/supabase';

type CompletedClassRecord = {
  id: string;
  applicationId: string;
  childId: string;
  childName: string;
  completedAt: string;
  classStartsAt: string;
  diary: string;
  teacherComment: string;
  photos: CompletedClassPhoto[];
  classItem: ClassItem;
};

type CompletedClassPhoto = {
  id: string;
  storagePath: string;
  fileName: string;
  signedUrl: string;
};

type StampCountryRow = {
  id: string;
  country: string;
  flag: string;
  sort_order: number;
};

type CompletedClassRow = {
  id: string;
  application_id: string;
  completed_at: string;
  diary: string;
  teacher_comment: string;
  completed_class_photos:
    | {
        id: string;
        storage_path: string;
        file_name: string;
        sort_order: number;
        created_at: string;
      }[]
    | null;
  applications: {
    child_id: string;
    children: {
      full_name: string;
    } | null;
    classes: {
      id: string;
      title: string;
      country: string;
      flag: string;
      campus: string;
      category: string;
      teacher_name: string;
      target_age: string;
      starts_at: string;
      location: string;
      seats_total: number;
      price: number;
      badge: string | null;
      image_color: string;
      description: string;
    } | null;
  } | null;
};

const completionPhotoBucket = 'completed-class-photos';
const completionPhotoSignedUrlLifetimeSeconds = 10 * 60;

type CompletedRecordsContextValue = {
  completedRecords: CompletedClassRecord[];
  stampProgressItems: StampProgressItem[];
  getStampProgressItems: (
    records?: CompletedClassRecord[],
  ) => StampProgressItem[];
  refreshCompletedRecords: () => Promise<void>;
};

const CompletedRecordsContext =
  createContext<CompletedRecordsContextValue | null>(null);

type CompletedRecordsProviderProps = {
  children: ReactNode;
};

function formatSchedule(startsAt: string) {
  const date = new Date(startsAt);

  if (Number.isNaN(date.getTime())) {
    return startsAt;
  }

  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${month}월 ${day}일 ${hours}:${minutes}`;
}

function mapSupabaseClass(row: NonNullable<CompletedClassRow['applications']>['classes']): ClassItem | null {
  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    country: row.country,
    flag: row.flag,
    campus: row.campus,
    category: row.category,
    teacherName: row.teacher_name,
    targetAge: row.target_age,
    startsAt: row.starts_at,
    schedule: formatSchedule(row.starts_at),
    location: row.location,
    seatsLeft: row.seats_total,
    seatsTaken: 0,
    seatsTotal: row.seats_total,
    priceLabel: row.price > 0 ? `1회 ${row.price.toLocaleString()}원` : '무료',
    badge: row.badge ?? '',
    imageColor: row.image_color,
    description: row.description,
  };
}

function getRecordSortTime(record: CompletedClassRecord) {
  const date = new Date(record.classStartsAt || record.completedAt);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

async function createPhotoSignedUrls(
  photos: NonNullable<CompletedClassRow['completed_class_photos']>,
) {
  const sortedPhotos = [...photos].sort((first, second) => {
    if (first.sort_order !== second.sort_order) {
      return first.sort_order - second.sort_order;
    }

    return first.created_at.localeCompare(second.created_at);
  });

  if (sortedPhotos.length === 0) return [];

  const { data, error } = await supabase.storage
    .from(completionPhotoBucket)
    .createSignedUrls(
      sortedPhotos.map((photo) => photo.storage_path),
      completionPhotoSignedUrlLifetimeSeconds,
    );

  if (error || !data) return [];

  return sortedPhotos
    .map((photo, index) => ({
      id: photo.id,
      storagePath: photo.storage_path,
      fileName: photo.file_name,
      signedUrl: data[index]?.signedUrl ?? '',
    }))
    .filter((photo) => photo.signedUrl);
}

function buildStampProgress(
  completedRecords: CompletedClassRecord[],
  stampCountries: StampCountryRow[],
) {
  const completedByCountry = new Map<string, number>();

  completedRecords.forEach((record) => {
    completedByCountry.set(
      record.classItem.country,
      (completedByCountry.get(record.classItem.country) ?? 0) + 1,
    );
  });

  const baseStampItems =
    stampCountries.length > 0
      ? stampCountries.map((country) => ({
          id: country.id,
          country: country.country,
          flag: country.flag,
        }))
      : stampItems;

  const knownCountries = new Set(baseStampItems.map((item) => item.country));
  const progressItems = baseStampItems.map((stamp) => {
    const completedCount = completedByCountry.get(stamp.country) ?? 0;

    return {
      ...stamp,
      collected: completedCount > 0,
      completedCount,
    };
  });

  completedRecords.forEach((record) => {
    if (knownCountries.has(record.classItem.country)) return;

    knownCountries.add(record.classItem.country);
    progressItems.push({
      id: `stamp-${record.classItem.id}`,
      country: record.classItem.country,
      flag: record.classItem.flag,
      collected: true,
      completedCount: completedByCountry.get(record.classItem.country) ?? 1,
    });
  });

  return progressItems;
}

export function CompletedRecordsProvider({
  children,
}: CompletedRecordsProviderProps) {
  const [completedRecords, setCompletedRecords] = useState<CompletedClassRecord[]>([]);
  const [stampCountries, setStampCountries] = useState<StampCountryRow[]>([]);

  const refreshCompletedRecords = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setCompletedRecords([]);
        setStampCountries([]);
        return;
      }

      const [completedResponse, stampCountriesResponse] = await Promise.all([
        supabase
          .from('completed_classes')
          .select(
            'id,application_id,completed_at,diary,teacher_comment,completed_class_photos(id,storage_path,file_name,sort_order,created_at),applications(child_id,children(full_name),classes(id,title,country,flag,campus,category,teacher_name,target_age,starts_at,location,seats_total,price,badge,image_color,description))',
          )
          .order('completed_at', { ascending: false }),
        supabase
          .from('stamp_countries')
          .select('id,country,flag,sort_order')
          .order('sort_order', { ascending: true }),
      ]);

      if (!stampCountriesResponse.error && stampCountriesResponse.data) {
        setStampCountries(stampCountriesResponse.data as StampCountryRow[]);
      }

      if (completedResponse.error || !completedResponse.data) return;

      const records = (await Promise.all(
        (completedResponse.data as unknown as CompletedClassRow[])
          .map(async (row) => {
          const classRow = row.applications?.classes ?? null;
          const classItem = mapSupabaseClass(classRow);
          if (!row.applications || !classRow || !classItem) return null;
          const photos = await createPhotoSignedUrls(
            row.completed_class_photos ?? [],
          );

          return {
            id: row.id,
            applicationId: row.application_id,
            childId: row.applications.child_id,
            childName: row.applications.children?.full_name ?? '',
            completedAt: row.completed_at,
            classStartsAt: classRow.starts_at,
            diary: row.diary,
            teacherComment: row.teacher_comment,
            photos,
            classItem,
          };
        }),
      ))
        .filter((record): record is CompletedClassRecord => record !== null)
        .sort((first, second) => getRecordSortTime(second) - getRecordSortTime(first));

      setCompletedRecords(records);
    } catch {
      setCompletedRecords([]);
      setStampCountries([]);
    }
  }, []);

  useEffect(() => {
    refreshCompletedRecords();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        refreshCompletedRecords();
      }

      if (event === 'SIGNED_OUT') {
        setCompletedRecords([]);
        setStampCountries([]);
      }
    });

    return () => subscription.unsubscribe();
  }, [refreshCompletedRecords]);

  useEffect(() => {
    const channel = supabase
      .channel('completed-records-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'completed_classes' },
        () => {
          refreshCompletedRecords();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'completed_class_photos' },
        () => {
          refreshCompletedRecords();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'applications' },
        () => {
          refreshCompletedRecords();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'classes' },
        () => {
          refreshCompletedRecords();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stamp_countries' },
        () => {
          refreshCompletedRecords();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshCompletedRecords]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      refreshCompletedRecords();
    }, 15000);

    return () => clearInterval(intervalId);
  }, [refreshCompletedRecords]);

  const stampProgressItems = useMemo(
    () => buildStampProgress(completedRecords, stampCountries),
    [completedRecords, stampCountries],
  );

  const getStampProgressItems = useCallback(
    (records: CompletedClassRecord[] = completedRecords) =>
      buildStampProgress(records, stampCountries),
    [completedRecords, stampCountries],
  );

  const value = useMemo<CompletedRecordsContextValue>(
    () => ({
      completedRecords,
      stampProgressItems,
      getStampProgressItems,
      refreshCompletedRecords,
    }),
    [
      completedRecords,
      stampProgressItems,
      getStampProgressItems,
      refreshCompletedRecords,
    ],
  );

  return (
    <CompletedRecordsContext.Provider value={value}>
      {children}
    </CompletedRecordsContext.Provider>
  );
}

export function useCompletedRecords() {
  const value = useContext(CompletedRecordsContext);

  if (!value) {
    throw new Error(
      'useCompletedRecords must be used within CompletedRecordsProvider',
    );
  }

  return value;
}
