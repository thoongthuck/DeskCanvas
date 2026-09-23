// 빨간 날 — 구글 캘린더의 공휴일 달력을 받아 캘린더 판 · 연대표에 표시 (code/icons/아이콘_가이드.md 12-5)
//   받아 오기 · 하루 한 번 확인 · 저장은 main.js (get-holidays). 인터넷이 없으면 마지막으로 받은 자료,
//   그것도 없으면 주말만 표시 (앱은 그대로 동작)
//   설정 → 캔버스 → '공휴일 달력' 켜기/끄기 · '나라'
// (InfiniteCanvas 에 붙는 메서드 모음 — renderer/app.js 에서 합쳐짐)

export const holidayMethods = {
  async loadHolidays() {
    const s = this.settings;
    const ticket = (this.holidayTicket || 0) + 1;            // 설정을 연달아 바꿨을 때 늦게 온 답은 버림
    this.holidayTicket = ticket;
    let days = null;
    if (s && s.holidays && window.canvasAPI && window.canvasAPI.getHolidays) {
      try {
        const data = await window.canvasAPI.getHolidays(s.holidayCountry, s.language === 'en' ? 'en' : 'ko');
        days = data && data.days;
      } catch (err) {
        this.log(`공휴일 못 불러옴: ${err && err.message}`);
      }
    }
    if (ticket !== this.holidayTicket) return;
    this.holidays = new Map(Object.entries(days || {}));
    if (this.boards.length) this.refreshAllBoards();
  },

  // 그날이 빨간 날이면 이름 (아니면 '')
  holidayName(key) {
    return (this.holidays && this.holidays.get(key)) || '';
  },
};
