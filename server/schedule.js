export function minutes(value) {
  const [hour, minute] = String(value || '00:00').split(':').map(Number);
  return hour * 60 + minute;
}

export function shouldRun(recording, now = new Date()) {
  if (!recording.enabled) return false;
  if (recording.triggerMode === 'trigger') return Boolean(recording.triggered);
  if (recording.schedule?.type === 'continuous') return true;
  const schedule = recording.schedule || {};
  if (schedule.type === 'once') {
    const start = new Date(schedule.startAt);
    const end = new Date(schedule.endAt);
    return now >= start && now < end;
  }
  if (schedule.type === 'weekly') {
    const days = schedule.days || [];
    const current = now.getHours() * 60 + now.getMinutes();
    const start = minutes(schedule.startTime);
    const end = minutes(schedule.endTime);
    if (end > start) return days.includes(now.getDay()) && current >= start && current < end;
    if (current >= start) return days.includes(now.getDay());
    return current < end && days.includes((now.getDay() + 6) % 7);
  }
  return false;
}
