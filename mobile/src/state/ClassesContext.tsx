import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState } from 'react-native';

import { ClassItem } from '@/src/data/classes';
import { supabase } from '@/src/lib/supabase';

type ClassRow = {
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
  is_open: boolean;
  active_application_count?: number | null;
};

type ClassesContextValue = {
  classes: ClassItem[];
  errorMessage: string;
  isLoading: boolean;
  refreshClasses: () => Promise<void>;
  getClassById: (classId: string) => ClassItem | undefined;
};

const ClassesContext = createContext<ClassesContextValue | null>(null);

type ClassesProviderProps = {
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

function normalizeCampus(campus: string) {
  return campus === '서울과기대' ? '서울과학기술대학교' : campus;
}

function mapClassRow(row: ClassRow): ClassItem {
  return {
    id: row.id,
    title: row.title,
    country: row.country,
    flag: row.flag,
    campus: normalizeCampus(row.campus),
    category: row.category,
    teacherName: row.teacher_name,
    targetAge: row.target_age,
    startsAt: row.starts_at,
    schedule: formatSchedule(row.starts_at),
    location: row.location,
    seatsLeft: row.seats_total,
    seatsTaken: row.active_application_count ?? 0,
    seatsTotal: row.seats_total,
    priceLabel: row.price > 0 ? `1회 ${row.price.toLocaleString()}원` : '무료',
    badge: row.badge ?? '',
    imageColor: row.image_color,
    description: row.description,
  };
}

export function ClassesProvider({ children }: ClassesProviderProps) {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classCatalog, setClassCatalog] = useState<ClassItem[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const refreshClasses = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const columns =
        'id,title,country,flag,campus,category,teacher_name,target_age,starts_at,location,seats_total,price,badge,image_color,description,is_open,active_application_count';
      let classRows: ClassRow[] | null = null;
      let { data, error } = await supabase
        .from('classes_with_seats')
        .select(columns)
        .order('starts_at', { ascending: true });

      if (!error && data) {
        classRows = data as ClassRow[];
      } else {
        const fallbackResponse = await supabase
          .from('classes')
          .select(
            'id,title,country,flag,campus,category,teacher_name,target_age,starts_at,location,seats_total,price,badge,image_color,description,is_open',
          )
          .order('starts_at', { ascending: true });

        error = fallbackResponse.error;
        classRows = fallbackResponse.data as ClassRow[] | null;
      }

      if (error) {
        setErrorMessage('문화교류 목록을 불러오지 못했어요. 잠시 후 다시 열어주세요.');
        return;
      }

      if (classRows) {
        const mappedClasses = classRows.map(mapClassRow);

        setClassCatalog(mappedClasses);
        setClasses(
          classRows
            .filter(
              (row) =>
                row.is_open &&
                new Date(row.starts_at).getTime() >= Date.now(),
            )
            .map(mapClassRow),
        );
      }
    } catch {
      setErrorMessage(
        '문화교류 목록을 불러오지 못했어요. 잠시 후 다시 열어주세요.',
      );
      setClasses([]);
      setClassCatalog([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshClasses();
  }, [refreshClasses]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        refreshClasses();
      }
    });

    return () => subscription.unsubscribe();
  }, [refreshClasses]);

  useEffect(() => {
    const channel = supabase
      .channel('classes-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'classes' },
        () => {
          refreshClasses();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'applications' },
        () => {
          refreshClasses();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshClasses]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      refreshClasses();
    }, 15000);

    return () => clearInterval(intervalId);
  }, [refreshClasses]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshClasses();
      }
    });

    return () => subscription.remove();
  }, [refreshClasses]);

  const value = useMemo<ClassesContextValue>(
    () => ({
      classes,
      errorMessage,
      isLoading,
      refreshClasses,
      getClassById: (classId) =>
        classCatalog.find((item) => item.id === classId),
    }),
    [classCatalog, classes, errorMessage, isLoading, refreshClasses],
  );

  return (
    <ClassesContext.Provider value={value}>
      {children}
    </ClassesContext.Provider>
  );
}

export function useClasses() {
  const value = useContext(ClassesContext);

  if (!value) {
    throw new Error('useClasses must be used within ClassesProvider');
  }

  return value;
}
