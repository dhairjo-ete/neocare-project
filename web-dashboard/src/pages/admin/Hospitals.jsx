import { useEffect, useState, useCallback } from "react";
import axiosClient from "../../api/axiosClient";
import Layout from "../../components/Layout";
import { useDataSync } from "../../hooks/useDataSync";

export default function Hospitals() {
  const [hospitals, setHospitals] = useState([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await axiosClient.get("/hospitals");
      setHospitals(data);
    } catch (err) {
      setError("Failed to load hospitals");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Real-time synchronization
  useDataSync(useCallback(() => {
    load();
  }, [load]));


  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      await axiosClient.post("/hospitals", { name, address });
      setName("");
      setAddress("");
      setSuccess("Hospital created successfully");
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not create hospital");
    }
  }

  function startEdit(h) {
    setEditingId(h._id);
    setEditName(h.name);
    setEditAddress(h.address || "");
    setError("");
    setSuccess("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditAddress("");
  }

  async function handleUpdate(id) {
    setError("");
    setSuccess("");
    try {
      await axiosClient.patch(`/hospitals/${id}`, {
        name: editName,
        address: editAddress,
      });
      setSuccess("Hospital updated successfully");
      setEditingId(null);
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not update hospital");
    }
  }

  async function handleDelete(id, hospitalName) {
    if (!window.confirm(`Delete hospital "${hospitalName}"? This will remove the hospital record.`)) return;
    setError("");
    setSuccess("");
    try {
      await axiosClient.delete(`/hospitals/${id}`);
      setSuccess(`Hospital "${hospitalName}" deleted.`);
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not delete hospital");
    }
  }

  return (
    <Layout>
      <h1 className="page-title">Hospitals</h1>


      {/* Add Hospital Form (System Admin) */}
      <form className="inline-form" onSubmit={handleCreate}>
        <div className="field">
          <label>Hospital Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. City Children's Hospital"
            required
          />
        </div>
        <div className="field">
          <label>Address / Location</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g. Block B, Medical Zone"
          />
        </div>
        <button className="btn-small" type="submit">
          + Add Hospital
        </button>
      </form>

      {error && <div className="error-text" style={{ marginBottom: 14 }}>{error}</div>}
      {success && <div className="success-text" style={{ marginBottom: 14 }}>{success}</div>}

      <div className="panel">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Hospital Name</th>
              <th style={{ textAlign: "left" }}>Address</th>
              <th style={{ textAlign: "center" }}>Hospital ID</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {hospitals.map((h) => {
              const isEditing = editingId === h._id;
              return (
                <tr key={h._id}>
                  <td style={{ textAlign: "left" }}>
                    {isEditing ? (
                      <input
                        className="input-text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={{ width: "100%", minWidth: 160 }}
                      />
                    ) : (
                      <strong>{h.name}</strong>
                    )}
                  </td>
                  <td style={{ textAlign: "left" }}>
                    {isEditing ? (
                      <input
                        className="input-text"
                        value={editAddress}
                        onChange={(e) => setEditAddress(e.target.value)}
                        style={{ width: "100%", minWidth: 160 }}
                      />
                    ) : (
                      h.address || "—"
                    )}
                  </td>
                  <td className="mono" style={{ textAlign: "center", fontSize: 12 }}>
                    {h._id}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {isEditing ? (
                      <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn-small" onClick={() => handleUpdate(h._id)}>
                          Save
                        </button>
                        <button className="btn-small-outline" onClick={cancelEdit}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn-small-outline" onClick={() => startEdit(h)}>
                          Edit
                        </button>
                        <button
                          className="btn-reject"
                          onClick={() => handleDelete(h._id, h.name)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!hospitals.length && (
              <tr>
                <td colSpan={4} className="empty-state">
                  No hospitals registered yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
