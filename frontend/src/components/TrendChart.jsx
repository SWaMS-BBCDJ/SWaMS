function TrendChart({
  readings = [],
  parameter,
  label,
}) {


  /* =====================================================
     NO DATA
  ===================================================== */

  if (readings.length === 0) {

    return (

      <div className="chart-panel">

        <div className="chart-label">
          {label}
        </div>

        <div className="chart-no-data">
          NO DATA
        </div>

      </div>

    );

  }


  /* =====================================================
     SORT READINGS BY DATE
  ===================================================== */

  const sortedReadings =
    [...readings].sort(
      (a, b) =>
        new Date(a.recordedAt) -
        new Date(b.recordedAt)
    );


  /* =====================================================
     GET VALUES
  ===================================================== */

  const values =
    sortedReadings
      .map((reading) =>
        Number(reading[parameter])
      )
      .filter((value) =>
        Number.isFinite(value)
      );


  /* =====================================================
     GRAPH DIMENSIONS
  ===================================================== */

  const width = 300;

  const height = 90;


  const paddingLeft = 5;

  const paddingRight = 5;

  const paddingTop = 6;

  const paddingBottom = 6;


  /* =====================================================
     MIN / MAX
  ===================================================== */

  const min =
    Math.min(...values);

  const max =
    Math.max(...values);


  const range =
    max - min || 1;


  /* =====================================================
     X POSITION
  ===================================================== */

  const getX = (index) => {

    if (values.length === 1) {

      return width / 2;

    }


    return (
      paddingLeft +
      (
        index /
        (values.length - 1)
      ) *
      (
        width -
        paddingLeft -
        paddingRight
      )
    );

  };


  /* =====================================================
     Y POSITION
  ===================================================== */

  const getY = (value) => {

    return (
      height -
      paddingBottom -
      (
        (value - min) /
        range
      ) *
      (
        height -
        paddingTop -
        paddingBottom
      )
    );

  };


  /* =====================================================
     CREATE POLYLINE
  ===================================================== */

  const points =
    values
      .map((value, index) => {

        return `${getX(index)},${getY(value)}`;

      })
      .join(" ");


  /* =====================================================
     RETURN
  ===================================================== */

  return (

    <div className="chart-panel">


      {/* =================================================
          LABEL
      ================================================= */}

      <div className="chart-label">
        {label}
      </div>


      {/* =================================================
          GRAPH
      ================================================= */}

      <div className="chart-graph">

        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="trend-chart"
        >


          {/* =============================================
              HORIZONTAL GRID LINES
          ============================================= */}

          <line
            x1="0"
            y1="15"
            x2={width}
            y2="15"
            stroke="#6c9a9b"
            strokeWidth="0.5"
          />


          <line
            x1="0"
            y1="45"
            x2={width}
            y2="45"
            stroke="#6c9a9b"
            strokeWidth="0.5"
          />


          <line
            x1="0"
            y1="75"
            x2={width}
            y2="75"
            stroke="#6c9a9b"
            strokeWidth="0.5"
          />


          {/* =============================================
              TREND LINE
          ============================================= */}

          <polyline
            points={points}
            fill="#28734D"
            stroke="#E5EDE7"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />


          {/* =============================================
              READING POINTS
          ============================================= */}

          {values.map(
            (value, index) => (

              <circle
                key={`${parameter}-${index}`}
                cx={getX(index)}
                cy={getY(value)}
                r="2.5"
                fill="#003f47"
              />

            )
          )}

        </svg>

      </div>

    </div>

  );

}


export default TrendChart;