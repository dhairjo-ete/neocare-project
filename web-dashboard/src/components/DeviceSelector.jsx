export default function DeviceSelector({ devices = [], selected, onChange }) {
  const deviceList = devices.length > 0 ? devices : ["incubator_01", "incubator_02"];

  return (
    <div className="device-selector-container">
      <span className="selector-label">Active Incubator:</span>
      <div className="device-pills">
        {deviceList.map((dev) => {
          const isActive = dev === selected;
          return (
            <button
              key={dev}
              type="button"
              className={`device-pill ${isActive ? "active" : ""}`}
              onClick={() => onChange(dev)}
            >
              <span className="device-dot"></span>
              {dev}
            </button>
          );
        })}
      </div>
    </div>
  );
}
