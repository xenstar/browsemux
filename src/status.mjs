export function exitCodeForStatus(status) {
  switch (status) {
    case 'success':
      return 0;
    case 'completed-unverified':
      return 2;
    case 'blocked':
      return 3;
    case 'effect-unknown':
      return 4;
    case 'limit':
      return 5;
    case 'error':
    default:
      return 1;
  }
}
