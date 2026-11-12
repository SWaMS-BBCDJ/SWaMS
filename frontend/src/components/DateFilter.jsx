
function DateFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onClear,
}) {
  return (
    <div className="date-filter">
      <label>FILTER DATE</label>

      <input
        type="date"
        value={startDate}
        onChange={(e) => onStartDateChange(e.target.value)}
      />

      <span>-</span>

      <input
        type="date"
        value={endDate}
        onChange={(e) => onEndDateChange(e.target.value)}
      />

      {(startDate || endDate) && (
        <button
          type="button"
          className="clear-filter-button"
          onClick={onClear}
        >
          Clear Date Filter
        </button>
      )}
    </div>
  );
}

export default DateFilter;
