# Globee Supabase

Supabase PostgreSQL, RLS 정책, Storage 정책, Edge Functions를 관리하는 폴더입니다.

## Folders

```text
sql/        SQL 마이그레이션과 정책 파일
functions/  Supabase Edge Functions
```

## Important Tables

- `profiles`: 사용자 역할과 보호자 정보
- `children`: 보호자별 아이 정보
- `classes`: 운영진이 개설한 문화교류 일정
- `applications`: 아이별 신청 상태
- `completed_classes`: 완료문화 기록과 선생님 코멘트
- `completed_class_photos`: 완료문화 사진 메타데이터
- `application_notifications`: 운영진 알림 발송 기록과 중복 발송 방지
- `guardian_consent_records`: 보호자 본인 확인과 필수·선택 동의 이력을 저장하는 추가 전용 기록
- `stamp_countries`: 스탬프 국가 목록

## Important Functions

- `apply_to_class(p_child_id, p_class_id)`: 학부모 앱의 신청 RPC
- `admin_confirm_application(p_application_id)`: 운영진 신청 승인 RPC
- `admin_cancel_pending_application(p_application_id)`: 운영진 확인중 신청 취소 RPC
- `admin_cancel_class(p_class_id)`: 운영진 수업 취소 RPC
- `admin_delete_class(p_class_id)`: 운영진 테스트 수업 완전 삭제 RPC
- `is_phone_registered(p_phone)`: 회원가입 중 전화번호 중복 확인
- `get_active_application_count(p_class_id)`: 자리 수 계산용 신청 수 조회
- `has_pending_review_applications_for_class(p_class_id, p_excluded_application_id)`: 완료문화/미참여 처리 전 확인중 신청 존재 여부 확인
- `record_guardian_consent_v2(...)`: 인증된 보호자 전화번호를 확인하고 현재 법률 문서 동의를 서버 시각으로 기록

## Application Status Flow

- `applied`: 학부모가 신청했고 운영진 확인을 기다리는 상태입니다. 자리 수에는 포함됩니다.
- `confirmed`: 운영진이 승인한 신청 완료 상태입니다. 완료문화 등록 대상입니다.
- `waiting`: 향후 대기/결제 흐름을 위해 남겨둔 상태입니다.
- `completed`: 완료문화와 스탬프에 반영된 상태입니다.
- `no_show`: 미참여 상태입니다.
- `canceled`: 신청 취소 상태입니다.

## Edge Functions

- `delete-account`: 학부모 계정 탈퇴 처리
- `notify-new-application`: 새 신청을 카카오워크 운영진 방으로 알림

`supabase/.env.example`은 Edge Function에 필요한 Secret 이름을 문서화하기 위한 예시 파일입니다. 실제 값은 Supabase Secrets에만 저장합니다.

배포:

```bash
npx supabase functions deploy delete-account --project-ref emuvubzjxdfdonjrabaw --no-verify-jwt
npx supabase functions deploy notify-new-application --project-ref emuvubzjxdfdonjrabaw --no-verify-jwt
```

`notify-new-application`은 `KAKAOWORK_WEBHOOK_URL` Supabase Secret이 필요합니다.
`application_notifications` 테이블이 있으면 같은 신청에 대한 카카오워크 알림 중복 발송을 막습니다.

## Release SQL Order

최근 변경을 반영할 때는 SQL Editor에서 아래 파일을 실행합니다.

```text
supabase/sql/20260418_application_notifications.sql
supabase/sql/20260418_harden_admin_delete_class.sql
supabase/sql/20260418_harden_finalization_workflow.sql
supabase/sql/20260419_restore_conditional_class_closure.sql
supabase/sql/20260628_explicit_data_api_grants.sql
supabase/sql/20260628_harden_security_definer_functions.sql
```

`20260418_close_class_on_first_finalized_application.sql`을 이미 실행한 DB는
`20260419_restore_conditional_class_closure.sql`을 추가로 실행해
active 신청이 남은 문화교류를 다시 열고, 이후에는 active 신청이 없을 때만
문화교류가 닫히도록 되돌립니다.

## Security Notes

- service role key는 Edge Function 환경변수로만 사용합니다.
- 프론트엔드에는 service role key를 넣지 않습니다.
- Edge Function은 `verify_jwt = false`로 배포하지만 함수 내부에서 `Authorization` 헤더와 `auth.getUser()`로 세션을 직접 검증한 뒤 service role client를 사용합니다.
- 카카오워크 Webhook URL은 Supabase Secret에만 저장하고 코드에 직접 넣지 않습니다.
- 새 SQL을 추가하면 Supabase SQL Editor에서 실행한 뒤 앱/관리자웹 주요 흐름을 다시 테스트합니다.
- `20260805132917_harden_applications_and_add_guardian_consents.sql`은 과거의 넓은 신청 UPDATE 정책 제거, 공개 신청 수 집계 수정, 보호자 동의 기록과 사진 선택 동의 정책을 함께 적용합니다.
- `20260805143323_remove_guardian_name_input_and_enforce_class_photo_consent.sql`은 보호자 이름 수집을 제거하고, 실제 참석자 전원이 사진에 동의한 문화교류만 관리자·메타데이터·Storage 단계에서 사진 업로드를 허용합니다.
- `20260806025115_stop_collecting_guardian_relationship.sql`은 보호자 관계 신규 수집을 제거하고, 기존 앱용 동의 함수는 호환 래퍼로 유지합니다.
- 새 테이블, 시퀀스, RPC를 추가할 때는 같은 SQL 파일에 역할별 최소 `GRANT`와 RLS 정책을 함께 작성합니다.
- `is_phone_registered` RPC는 기존 설치 앱 호환성을 위해 임시 유지합니다. 해당 RPC 호출을 제거한 모바일 업데이트가 운영 사용자에게 배포된 뒤 실행 권한을 제거합니다.
- Supabase Pro 이상에서는 Auth 설정의 Leaked Password Protection을 활성화합니다.
- Storage 사진 파일은 private bucket에 저장하고, RLS로 해당 보호자와 운영진만 접근하게 합니다.
- 활동 사진은 같은 문화교류의 실제 참석자 전원이 현재 문서 버전의 사진 선택 동의에 동의했을 때만 운영진이 추가할 수 있습니다.
