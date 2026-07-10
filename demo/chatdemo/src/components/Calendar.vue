<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Message } from 'wukongimjssdk'

const props = defineProps<{
    messages: Message[]
    visible: boolean
}>()

const emit = defineEmits<{
    (e: 'select', date: string): void
    (e: 'close'): void
}>()

const currentYear = ref(new Date().getFullYear())
const currentMonth = ref(new Date().getMonth())

// Reset to current month when opened
watch(() => props.visible, (v) => {
    if (v) {
        const now = new Date()
        currentYear.value = now.getFullYear()
        currentMonth.value = now.getMonth()
    }
})

const today = new Date()
const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

const messageDates = computed(() => {
    const dates = new Set<string>()
    for (const m of props.messages) {
        if (!m.timestamp) continue
        const d = new Date(m.timestamp * 1000)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        dates.add(key)
    }
    return dates
})

const monthLabel = computed(() => `${currentYear.value}年${currentMonth.value + 1}月`)

const weekDays = ['日', '一', '二', '三', '四', '五', '六']

const weeks = computed(() => {
    const year = currentYear.value
    const month = currentMonth.value
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const cells: Array<{ day: number, dateStr: string, isCurrentMonth: boolean }> = []

    // Previous month padding
    const prevMonthDays = new Date(year, month, 0).getDate()
    for (let i = firstDay - 1; i >= 0; i--) {
        const d = prevMonthDays - i
        const m2 = month === 0 ? 12 : month
        const y2 = month === 0 ? year - 1 : year
        const dateStr = `${y2}-${String(m2).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        cells.push({ day: d, dateStr, isCurrentMonth: false })
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        cells.push({ day: d, dateStr, isCurrentMonth: true })
    }

    // Next month padding
    const remaining = 42 - cells.length
    for (let d = 1; d <= remaining; d++) {
        const nextMonth = month + 2 > 12 ? 1 : month + 2
        const nextYear = month + 2 > 12 ? year + 1 : year
        const dateStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        cells.push({ day: d, dateStr, isCurrentMonth: false })
    }

    const result: typeof cells[] = []
    for (let i = 0; i < cells.length; i += 7) {
        result.push(cells.slice(i, i + 7))
    }
    return result
})

const prevMonth = () => {
    if (currentMonth.value === 0) {
        currentMonth.value = 11
        currentYear.value--
    } else {
        currentMonth.value--
    }
}

const nextMonth = () => {
    if (currentMonth.value === 11) {
        currentMonth.value = 0
        currentYear.value++
    } else {
        currentMonth.value++
    }
}

const selectDate = (dateStr: string, isCurrentMonth: boolean) => {
    if (!isCurrentMonth) return
    if (!messageDates.value.has(dateStr)) return
    emit('select', dateStr)
}
</script>

<template>
    <transition name="calendar-fade">
        <div class="calendar-overlay" v-if="visible" @click.self="emit('close')">
            <div class="calendar-panel" @click.stop>
                <div class="calendar-header">
                    <button class="cal-nav-btn" @click="prevMonth">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                            <polyline points="15 18 9 12 15 6"/>
                        </svg>
                    </button>
                    <span class="cal-month-label">{{ monthLabel }}</span>
                    <button class="cal-nav-btn" @click="nextMonth">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                            <polyline points="9 18 15 12 9 6"/>
                        </svg>
                    </button>
                </div>
                <div class="cal-weekdays">
                    <span v-for="w in weekDays" :key="w" class="cal-weekday">{{ w }}</span>
                </div>
                <div class="cal-weeks">
                    <div class="cal-week" v-for="(week, wi) in weeks" :key="wi">
                        <button
                            v-for="cell in week"
                            :key="cell.dateStr"
                            class="cal-day"
                            :class="{
                                'cal-day-other': !cell.isCurrentMonth,
                                'cal-day-today': cell.dateStr === todayStr,
                                'cal-day-has-msg': cell.isCurrentMonth && messageDates.has(cell.dateStr),
                                'cal-day-no-msg': cell.isCurrentMonth && !messageDates.has(cell.dateStr),
                            }"
                            @click="selectDate(cell.dateStr, cell.isCurrentMonth)"
                            :disabled="!cell.isCurrentMonth || !messageDates.has(cell.dateStr)"
                        >
                            <span class="cal-day-num">{{ cell.day }}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </transition>
</template>

<style scoped>
.calendar-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(2px);
}

.calendar-panel {
    background: var(--bg-card);
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    padding: 24px 20px 16px;
    width: 340px;
}

.calendar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
    padding: 0 4px;
}

.cal-month-label {
    font-size: 17px;
    font-weight: 700;
    color: var(--text);
    user-select: none;
}

.cal-nav-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
}

.cal-nav-btn:hover {
    background: var(--bg-elevated);
    color: var(--text);
}

.cal-weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
    margin-bottom: 4px;
}

.cal-weekday {
    text-align: center;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    padding: 4px 0;
    user-select: none;
}

.cal-weeks {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.cal-week {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
}

.cal-day {
    aspect-ratio: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border: none;
    border-radius: 10px;
    background: transparent;
    cursor: default;
    font-size: 14px;
    color: var(--text);
    transition: all 0.15s;
    position: relative;
}

.cal-day-other {
    color: transparent;
    pointer-events: none;
}

.cal-day-today {
    font-weight: 700;
    color: var(--primary);
}

.cal-day-no-msg {
    color: var(--text-muted);
    opacity: 0.35;
}

.cal-day-has-msg {
    cursor: pointer;
    font-weight: 600;
    color: var(--text);
}

.cal-day-has-msg:hover {
    background: var(--primary);
    color: #fff;
    transform: scale(1.08);
}

.cal-day-has-msg:active {
    transform: scale(0.95);
}

.cal-day-num {
    line-height: 1;
}

/* Transition */
.calendar-fade-enter-active,
.calendar-fade-leave-active {
    transition: opacity 0.2s ease;
}

.calendar-fade-enter-active .calendar-panel,
.calendar-fade-leave-active .calendar-panel {
    transition: transform 0.2s ease;
}

.calendar-fade-enter-from,
.calendar-fade-leave-to {
    opacity: 0;
}

.calendar-fade-enter-from .calendar-panel {
    transform: scale(0.92) translateY(10px);
}

.calendar-fade-leave-to .calendar-panel {
    transform: scale(0.92) translateY(10px);
}
</style>
