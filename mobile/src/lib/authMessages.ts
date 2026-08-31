export function getOtpVerificationErrorMessage(message?: string) {
  const normalizedMessage = message?.toLowerCase() ?? '';

  if (
    normalizedMessage.includes('expired') ||
    normalizedMessage.includes('invalid') ||
    normalizedMessage.includes('token')
  ) {
    return '인증번호가 맞지 않거나 만료됐어요. 번호를 확인하거나 다시 받아주세요.';
  }

  if (
    normalizedMessage.includes('rate') ||
    normalizedMessage.includes('too many')
  ) {
    return '요청이 너무 많아요. 잠시 후 다시 시도해주세요.';
  }

  return '인증번호를 확인하지 못했어요. 잠시 후 다시 시도해주세요.';
}

export function getOtpSendErrorMessage(message?: string) {
  const normalizedMessage = message?.toLowerCase() ?? '';

  if (
    normalizedMessage.includes('rate') ||
    normalizedMessage.includes('too many') ||
    normalizedMessage.includes('limit')
  ) {
    return '인증번호를 너무 자주 요청했어요. 잠시 후 다시 시도해주세요.';
  }

  return '인증번호를 보내지 못했어요. 잠시 후 다시 시도해주세요.';
}

export function getPasswordUpdateErrorMessage(message?: string) {
  const normalizedMessage = message?.toLowerCase() ?? '';

  if (
    normalizedMessage.includes('weak') ||
    normalizedMessage.includes('password')
  ) {
    return '비밀번호 조건을 다시 확인해주세요.';
  }

  if (
    normalizedMessage.includes('session') ||
    normalizedMessage.includes('jwt') ||
    normalizedMessage.includes('auth')
  ) {
    return '인증 시간이 만료됐어요. 전화번호 인증부터 다시 진행해주세요.';
  }

  return '비밀번호를 저장하지 못했어요. 잠시 후 다시 시도해주세요.';
}

export function getApplicationErrorMessage(message?: string) {
  const text = message ?? '';

  if (text.includes('로그인')) {
    return '로그인이 필요해요. 다시 로그인한 뒤 신청해주세요.';
  }

  if (text.includes('등록된 아이')) {
    return '아이 정보를 확인하지 못했어요. 마이페이지에서 아이 정보를 다시 확인해주세요.';
  }

  if (text.includes('신청할 수 없는')) {
    return '지금은 신청할 수 없는 문화교류예요.';
  }

  if (text.includes('지난')) {
    return '이미 지난 문화교류예요.';
  }

  if (text.includes('이미 신청')) {
    return '이미 신청한 문화교류예요.';
  }

  if (text.includes('마감')) {
    return '마감된 문화교류예요.';
  }

  return '문화교류 신청을 저장하지 못했어요. 잠시 후 다시 시도해주세요.';
}
