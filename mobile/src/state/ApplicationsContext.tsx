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
  ApplicationItem,
} from '@/src/data/classes';
import { supabase } from '@/src/lib/supabase';
import { getCurrentGuardianConsent } from '@/src/lib/legalConsent';

type ApplicationInput = Omit<ApplicationItem, 'id'>;

type ApplicationRow = {
  id: string;
  class_id: string;
  child_id: string;
  status:
    | 'applied'
    | 'waiting'
    | 'confirmed'
    | 'completed'
    | 'no_show'
    | 'canceled';
  children: {
    full_name: string;
  } | null;
  classes: {
    id: string;
  } | null;
};

const activeApplicationStatuses = new Set<ApplicationItem['status']>([
  '신청 확인중',
  '신청 완료',
  '확정 대기',
]);

const statusMap: Record<ApplicationRow['status'], ApplicationItem['status']> = {
  applied: '신청 확인중',
  waiting: '확정 대기',
  confirmed: '신청 완료',
  completed: '완료문화',
  no_show: '미참여',
  canceled: '신청 취소',
};

function isActiveApplication(application: ApplicationItem) {
  return activeApplicationStatuses.has(application.status);
}

async function notifyNewApplication(applicationId: string) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) return;

    const { error } = await supabase.functions.invoke('notify-new-application', {
      body: { applicationId },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) return;
  } catch {
    // 신청 저장은 완료된 상태이므로 운영진 알림 실패는 사용자 흐름을 막지 않는다.
  }
}

type ApplicationsContextValue = {
  applications: ApplicationItem[];
  addApplication: (application: ApplicationInput) => Promise<boolean>;
  cancelApplication: (id: string) => Promise<void>;
  hasActiveApplication: (classId: string, childId: string) => boolean;
  refreshApplications: () => Promise<void>;
};

const ApplicationsContext = createContext<ApplicationsContextValue | null>(null);

type ApplicationsProviderProps = {
  children: ReactNode;
};

export function ApplicationsProvider({ children }: ApplicationsProviderProps) {
  const [applications, setApplications] = useState<ApplicationItem[]>([]);

  const mapApplicationRow = (row: ApplicationRow): ApplicationItem => {
    return {
      id: row.id,
      classId: row.class_id,
      childId: row.child_id,
      childName: row.children?.full_name ?? '',
      status: statusMap[row.status],
    };
  };

  const refreshApplications = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setApplications([]);
        return;
      }

      const { data, error } = await supabase
        .from('applications')
        .select('id,class_id,child_id,status,children(full_name),classes(id)')
        .neq('status', 'canceled')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setApplications(
          (data as unknown as ApplicationRow[])
            .filter((row) => row.classes)
            .map(mapApplicationRow),
        );
      }
    } catch {
      setApplications([]);
    }
  }, []);

  useEffect(() => {
    refreshApplications();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        refreshApplications();
      }

      if (event === 'SIGNED_OUT') {
        setApplications([]);
      }
    });

    return () => subscription.unsubscribe();
  }, [refreshApplications]);

  useEffect(() => {
    const channel = supabase
      .channel('applications-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'applications' },
        () => {
          refreshApplications();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'classes' },
        () => {
          refreshApplications();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshApplications]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      refreshApplications();
    }, 15000);

    return () => clearInterval(intervalId);
  }, [refreshApplications]);

  const value = useMemo<ApplicationsContextValue>(
    () => ({
      applications,
      refreshApplications,
      addApplication: async (application) => {
        const alreadyApplied = applications.some(
          (item) =>
            isActiveApplication(item) &&
            item.classId === application.classId &&
            item.childId === application.childId,
        );

        if (alreadyApplied) return false;

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const consent = await getCurrentGuardianConsent(user.id);
          if (!consent) {
            throw new Error('문화교류 신청 전에 보호자 동의를 완료해주세요.');
          }

          const { data, error } = await supabase.rpc('apply_to_class', {
            p_child_id: application.childId,
            p_class_id: application.classId,
          });

          if (error) throw error;
          const row = data as ApplicationRow;
          void notifyNewApplication(row.id);

          setApplications((prev) => [
            {
              id: row.id,
              classId: row.class_id,
              childId: row.child_id,
              childName: application.childName,
              status: statusMap[row.status],
            },
            ...prev,
          ]);

          return true;
        }

        setApplications((prev) => {
          if (
            prev.some(
              (item) =>
                isActiveApplication(item) &&
                item.classId === application.classId &&
                item.childId === application.childId,
            )
          ) {
            return prev;
          }

          return [
            {
              ...application,
              id: `application-${Date.now()}-${application.childId}`,
            },
            ...prev,
          ];
        });

        return true;
      },
      cancelApplication: async (id) => {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { error } = await supabase
            .from('applications')
            .update({ status: 'canceled', updated_at: new Date().toISOString() })
            .eq('id', id);

          if (error) throw error;
        }

        setApplications((prev) => prev.filter((item) => item.id !== id));
      },
      hasActiveApplication: (classId, childId) =>
        applications.some(
          (item) =>
            isActiveApplication(item) &&
            item.classId === classId &&
            item.childId === childId,
        ),
    }),
    [applications, refreshApplications],
  );

  return (
    <ApplicationsContext.Provider value={value}>
      {children}
    </ApplicationsContext.Provider>
  );
}

export function useApplications() {
  const value = useContext(ApplicationsContext);

  if (!value) {
    throw new Error('useApplications must be used within ApplicationsProvider');
  }

  return value;
}
