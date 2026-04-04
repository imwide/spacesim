const replacement = `{mapSurfaceMarkers.map((marker) => {
                  const projected = project(marker.mapPosition);
                  const selected = selectedVisibleMarker?.id === marker.id || selectedMarker?.id === marker.id;
                  const isCurrent = marker.id === currentSystemMarkerId || marker.id === currentShipMarkerId || marker.id === nearestContact;
                  const shouldShowLabel = selected;

                  const markerDistance = marker.localPosition ? distanceBetweenPoints(shipAbsolutePosition, marker.localPosition) : null;
                  const markerStationNode = marker.kind === 'station' ? stationById.get(marker.id) : marker.stationNode;
                  const canTravel = Boolean(hudMode === 'space' && markerStationNode);
                  const canAutopilot = Boolean(marker.kind !== 'system' && hudMode !== 'space' && marker.systemId === activeSystemId && typeof markerDistance === 'number' && markerDistance > 50);
                  const isAutopilotTarget = autopilotEngaged && autopilotDestinationId === marker.id;

                  return (
                    <button
                      className={\`tablet-marker tablet-marker-\${marker.kind} \${selected ? 'tablet-marker-selected' : ''} \${isCurrent ? 'tablet-marker-current' : ''}\`}
                      key={marker.id}
                      onClick={() => {
                        focusMarker(marker.id, undefined);
                      }}
                      style={{
                        left: \`\${projected.left}px\`,
                        top: \`\${projected.top}px\`,
                        ['--tablet-label-scale' as string]: \`\${1 / zoom}\`,
                        zIndex: selected ? 1000 : undefined
                      }}
                      type="button"
                    >
                      <span className="tablet-marker-ping" />
                      <span className="tablet-marker-core" />
                      {shouldShowLabel ? (
                        <div className="tablet-marker-label" onClick={(e) => e.stopPropagation()}>
                          <strong>{marker.name}</strong>
                          <small>{marker.subtitle}</small>

                          <div className="tablet-label-actions">
                            {marker.kind === 'system' && mapMode === 'galaxy' ? (
                              <button onClick={(e) => { e.stopPropagation(); setMapMode('system'); }} type="button">
                                Zoom into Star System
                              </button>
                            ) : null}

                            {marker.kind !== 'system' && marker.kind !== 'ship' && mapMode !== 'sector' && (marker.kind === 'planet' || marker.kind === 'moon' || marker.kind === 'asteroid-belt' || marker.kind === 'star') ? (
                              <button onClick={(e) => { e.stopPropagation(); setMapMode('sector'); }} type="button">
                                Zoom into Sector
                              </button>
                            ) : null}

                            {canTravel && markerStationNode ? (
                              <button onClick={(e) => { e.stopPropagation(); onTravel(markerStationNode); }} type="button">
                                Fast travel here
                              </button>
                            ) : null}

                            {canAutopilot ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isAutopilotTarget) {
                                    onStopAutopilot();
                                  } else {
                                    const dest = buildDestination(marker);
                                    if (dest) {
                                      onEngageAutopilot(dest);
                                    }
                                  }
                                }}
                                type="button"
                              >
                                {isAutopilotTarget ? 'Stop autopilot' : 'Set autopilot'}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </button>
                  );
                })}`;

code = code.replace(regex, replacement);
fs.writeFileSync('client/src/App.tsx', code);
console.log(code.indexOf('Zoom into Star System') > -1 ? 'Success' : 'Failed');
